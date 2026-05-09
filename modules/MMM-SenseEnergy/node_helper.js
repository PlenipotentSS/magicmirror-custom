const NodeHelper = require("node_helper");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "kwh-history.json");

const SENSE_AUTH_URL = "https://api.sense.com/apiservice/api/v1/authenticate";
const SENSE_TRENDS_URL = "https://api.sense.com/apiservice/api/v1/app/history/trends";
const SENSE_WS_URL = "wss://clientrt.sense.com/monitors/{monitorId}/realtimefeed";
const RECONNECT_DELAY_MS = 10000;
const PING_INTERVAL_MS = 30000;
const TRENDS_INTERVAL_MS = 5 * 60 * 1000;

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-SenseEnergy] helper started");
    this.config = null;
    this.accessToken = null;
    this.monitorId = null;
    this.ws = null;
    this.pingTimer = null;
    this.trendsTimer = null;
    this.reconnectTimer = null;
    this.totalWatts = 0;
    this.devices = [];
    this.deviceNames = {};  // id → name map built from realtime_update
    this.daily = null;
    this.peakWattsToday = 0;
    this.kwhTodayAccum = 0;
    this.lastWattsTime = null;
    this.todayKey = null;
    this.kwhHistory = {};
    this._loadHistory();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      this._init();
    }
  },

  async _init() {
    try {
      await this._authenticate();
      this._openWebSocket();
      this._startTrendsPolling();
    } catch (e) {
      console.error("[MMM-SenseEnergy] Init failed:", e.message);
      this.sendSocketNotification("SENSE_ERROR", { message: "Auth failed: " + e.message });
    }
  },

  async _authenticate() {
    console.log("[MMM-SenseEnergy] Authenticating…");
    const body = new URLSearchParams({
      email: this.config.email,
      password: this.config.password,
    });

    const res = await fetch(SENSE_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " from Sense auth");
    }

    const data = await res.json();
    if (!data.access_token) {
      throw new Error("No access_token in Sense auth response");
    }

    this.accessToken = data.access_token;
    this.monitorId = data.monitors && data.monitors[0] && data.monitors[0].id;

    if (!this.monitorId) {
      throw new Error("No monitor ID in Sense auth response");
    }

    console.log("[MMM-SenseEnergy] Authenticated, monitor ID:", this.monitorId);
  },

  _openWebSocket() {
    if (this.ws) {
      try { this.ws.terminate(); } catch (_) {}
      this.ws = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    const url = SENSE_WS_URL.replace("{monitorId}", this.monitorId)
      + "?access_token=" + encodeURIComponent(this.accessToken);

    console.log("[MMM-SenseEnergy] Opening WebSocket…");
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[MMM-SenseEnergy] WebSocket connected");
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, PING_INTERVAL_MS);
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        this._handleWsMessage(msg);
      } catch (e) {
        console.warn("[MMM-SenseEnergy] WS parse error:", e.message);
      }
    });

    this.ws.on("error", (e) => {
      console.error("[MMM-SenseEnergy] WebSocket error:", e.message);
    });

    this.ws.on("close", () => {
      console.warn("[MMM-SenseEnergy] WebSocket closed, reconnecting in 10s…");
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.reconnectTimer = setTimeout(() => this._reconnect(), RECONNECT_DELAY_MS);
    });
  },

  async _reconnect() {
    try {
      await this._authenticate();
      this._openWebSocket();
    } catch (e) {
      console.error("[MMM-SenseEnergy] Reconnect auth failed:", e.message);
      this.reconnectTimer = setTimeout(() => this._reconnect(), RECONNECT_DELAY_MS);
    }
  },

  _handleWsMessage(msg) {
    if (msg.type === "realtime_update" && msg.payload) {
      const p = msg.payload;
      const watts = p.w || 0;

      this._accumulateKwh(watts);

      if (watts > this.peakWattsToday) {
        this.peakWattsToday = watts;
      }

      this.totalWatts = watts;

      const rawDevices = p.devices || [];

      // Keep id→name map current for device_states lookups
      rawDevices.forEach(d => { if (d.id && d.name) this.deviceNames[d.id] = d.name; });

      // Collect always-on baselines from devices that have ao_w set
      let alwaysOnWatts = 0;
      this.devices = rawDevices
        .filter(d => d.w > 0)
        .map(d => {
          if (d.ao_w && d.ao_st) alwaysOnWatts += d.ao_w;
          return { name: d.name, watts: d.w, alwaysOn: false };
        });

      if (alwaysOnWatts > 0) {
        this.devices.push({ name: "Always On", watts: alwaysOnWatts, alwaysOn: true });
      }

      this.sendSocketNotification("SENSE_REALTIME", {
        totalWatts: this.totalWatts,
        devices: this.devices,
      });
    }

    if (msg.type === "device_states" && msg.payload) {
      // payload.states is an array of { device_id, mode, state: "online"|"offline" }
      const states = msg.payload.states || [];
      states.forEach(s => {
        const name = this.deviceNames[s.device_id] || s.device_id;
        const state = s.state === "online" ? "on" : "off";
        this.sendSocketNotification("SENSE_EVENT", {
          deviceName: name,
          state,
          timestamp: Date.now(),
        });
      });
    }
  },

  _loadHistory() {
    try {
      this.kwhHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    } catch (_) { this.kwhHistory = {}; }
  },

  _saveHistory(kwhToday) {
    const today = this._todayKey();
    this.kwhHistory[today] = kwhToday;
    const keys = Object.keys(this.kwhHistory).sort();
    if (keys.length > 30) keys.slice(0, keys.length - 30).forEach(k => delete this.kwhHistory[k]);
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.kwhHistory), "utf8");
    } catch (e) {
      console.warn("[MMM-SenseEnergy] Failed to save history:", e.message);
    }
  },

  _accumulateKwh(watts) {
    const now = Date.now();
    const todayKey = this._todayKey();

    if (todayKey !== this.todayKey) {
      this.peakWattsToday = 0;
      this.kwhTodayAccum = 0;
      this.todayKey = todayKey;
    }

    if (this.lastWattsTime !== null) {
      const elapsedHours = (now - this.lastWattsTime) / 3600000;
      if (elapsedHours < 0.1) {
        this.kwhTodayAccum += (watts / 1000) * elapsedHours;
      }
    }

    this.lastWattsTime = now;
  },

  _todayKey() {
    const d = new Date();
    return d.getFullYear() + "-"
      + String(d.getMonth() + 1).padStart(2, "0") + "-"
      + String(d.getDate()).padStart(2, "0");
  },

  _startTrendsPolling() {
    this._fetchTrends();
    this.trendsTimer = setInterval(() => this._fetchTrends(), TRENDS_INTERVAL_MS);
  },

  async _fetchTrends() {
    if (!this.accessToken || !this.monitorId) return;

    try {
      const today = this._todayKey();
      const yesterday = this._yesterdayKey();

      const [todayData, yesterdayData] = await Promise.all([
        this._fetchDayTrend(today),
        this._fetchDayTrend(yesterday),
      ]);

      const kwhToday = todayData || this.kwhTodayAccum;
      const kwhYesterday = yesterdayData || 0;
      const estimatedCost = kwhToday * this.config.costPerKwh;

      this._saveHistory(kwhToday);
      this.daily = {
        kwhToday,
        kwhYesterday,
        peakWatts: this.peakWattsToday,
        estimatedCost,
        kwhHistory: this.kwhHistory,
      };

      this.sendSocketNotification("SENSE_DAILY", this.daily);
    } catch (e) {
      console.error("[MMM-SenseEnergy] Trends fetch error:", e.message);
      if (e.message.includes("401")) {
        try {
          await this._authenticate();
          this._fetchTrends();
        } catch (_) {}
      }
    }
  },

  async _fetchDayTrend(dateKey) {
    const url = SENSE_TRENDS_URL
      + "?monitor_id=" + this.monitorId
      + "&device_id=usage"
      + "&scale=DAY"
      + "&start=" + dateKey;

    const res = await fetch(url, {
      headers: { Authorization: "bearer " + this.accessToken },
    });

    if (res.status === 401) throw new Error("401 unauthorized");
    if (!res.ok) return null;

    const data = await res.json();
    // consumption is { total, totals[], devices[] } — extract the kWh total
    if (data && data.consumption && typeof data.consumption.total === "number") return data.consumption.total;
    if (data && typeof data.consumption === "number") return data.consumption;
    return null;
  },

  _yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-"
      + String(d.getMonth() + 1).padStart(2, "0") + "-"
      + String(d.getDate()).padStart(2, "0");
  },

});
