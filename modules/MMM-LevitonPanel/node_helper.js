const NodeHelper = require("node_helper");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const BASE = "https://my.leviton.com/api";
const WS_URL = "wss://socket.cloud.leviton.com/";
const HEARTBEAT_MS = 10 * 1000;
const BANDWIDTH_MS = 50 * 1000;
const ENERGY_POLL_MS = 60 * 1000;
const ACCUM_SAVE_MS = 2 * 60 * 1000;   // save accumulator every 2 min
const WS_RECONNECT_MS = 55 * 60 * 1000;
const ACCUM_FILE   = path.join(__dirname, "kwh-today.json");
const HISTORY_FILE = path.join(__dirname, "kwh-history.json");

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-LevitonPanel] helper started");
    this.config = null;
    this.token = null;
    this.userId = null;
    this.residenceId = null;
    this.panels = [];
    this.breakers = {};       // id → { name, watts, watts2, state, position, poles }
    this.kwhToday = 0;        // accumulated kWh since midnight
    this.kwhHistory = {};     // { "YYYY-MM-DD": kWh } last 30 days
    this.lastAccumMs = null;  // timestamp of last watt integration
    this.ws = null;
    this.heartbeatTimer = null;
    this.bandwidthTimer = null;
    this.energyTimer = null;
    this.accumSaveTimer = null;
    this.midnightTimer = null;
    this.reconnectTimer = null;
    this._loadAccum();
    this._loadHistory();
  },

  // ── Accumulator persistence ───────────────────────────────────────────────

  _loadAccum() {
    try {
      const saved = JSON.parse(fs.readFileSync(ACCUM_FILE, "utf8"));
      if (saved.day === this._todayKey()) {
        this.kwhToday = saved.kwhToday ?? 0;
        console.log("[MMM-LevitonPanel] Loaded today's kWh from disk:", this.kwhToday.toFixed(3));
      } else {
        console.log("[MMM-LevitonPanel] Accumulator file is from", saved.day, "— starting fresh");
      }
    } catch (_) { /* no file yet */ }
  },

  _saveAccum() {
    try {
      fs.writeFileSync(ACCUM_FILE, JSON.stringify({
        day: this._todayKey(),
        kwhToday: this.kwhToday,
        savedAt: new Date().toISOString(),
      }), "utf8");
    } catch (e) {
      console.warn("[MMM-LevitonPanel] Failed to save accumulator:", e.message);
    }
  },

  _loadHistory() {
    try {
      const saved = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
      // Merge saved entries into memory, never drop existing in-memory entries
      Object.assign(this.kwhHistory, saved);
    } catch (_) {}
  },

  _saveHistory() {
    // Update today's entry, prune to last 30 days
    const today = this._todayKey();
    this.kwhHistory[today] = this.kwhToday;
    const keys = Object.keys(this.kwhHistory).sort();
    if (keys.length > 30) keys.slice(0, keys.length - 30).forEach(k => delete this.kwhHistory[k]);
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.kwhHistory), "utf8");
    } catch (e) {
      console.warn("[MMM-LevitonPanel] Failed to save history:", e.message);
    }
  },

  // ── Watt integration — called whenever total watts is known ───────────────

  _integrateWatts() {
    const now = Date.now();
    if (this.lastAccumMs !== null) {
      const elapsedHours = (now - this.lastAccumMs) / 3600000;
      // Only integrate if gap is reasonable (ignore gaps > 5 min, e.g. restarts)
      if (elapsedHours < (5 / 60)) {
        const totalWatts = Object.values(this.breakers)
          .reduce((s, b) => s + (b.watts ?? 0) + (b.watts2 ?? 0), 0);
        this.kwhToday += (totalWatts / 1000) * elapsedHours;
      }
    }
    this.lastAccumMs = now;
  },

  // ── Midnight reset ────────────────────────────────────────────────────────

  _scheduleMidnightReset() {
    clearTimeout(this.midnightTimer);
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 30, 0);
    const ms = midnight - now;
    console.log("[MMM-LevitonPanel] Midnight reset in", Math.round(ms / 60000), "min");
    this.midnightTimer = setTimeout(() => {
      console.log("[MMM-LevitonPanel] Midnight — resetting daily kWh accumulator");
      this._saveHistory();
      this.kwhToday = 0;
      this.lastAccumMs = null;
      this._saveAccum();
      this._scheduleMidnightReset();
    }, ms);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      this._init();
    }
  },

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  async _init() {
    try {
      await this._authenticate();
      await this._discoverPanels();
      await this._fetchBreakerRest();
      this._openWebSocket();
      this._startHeartbeat();
      this._startBandwidthKeepalive();
      this._startEnergyPolling();
      this._startAccumSaving();
      this._scheduleMidnightReset();
      this._scheduleWsReconnect();
    } catch (e) {
      console.error("[MMM-LevitonPanel] Init failed:", e.message);
      this.sendSocketNotification("LEVITON_ERROR", { message: e.message });
    }
  },

  // ── Auth ──────────────────────────────────────────────────────────────────

  async _authenticate() {
    console.log("[MMM-LevitonPanel] Authenticating…");
    const res = await fetch(BASE + "/Person/login?include=user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
    });
    if (!res.ok) throw new Error("Login HTTP " + res.status);
    const data = await res.json();
    this.token = data?.id;
    this.userId = data?.userId;
    if (!this.token || !this.userId) throw new Error("No token/userId in login response");
    console.log("[MMM-LevitonPanel] Authenticated, userId:", this.userId);
  },

  async _discoverPanels() {
    const perms = await this._get(`/Person/${this.userId}/residentialPermissions`);
    const accountId = perms?.find(p => p.residentialAccountId)?.residentialAccountId;
    if (!accountId) throw new Error("No residentialAccountId found");

    const residences = await this._get(`/ResidentialAccounts/${accountId}/residences`);
    this.residenceId = residences?.[0]?.id;
    if (!this.residenceId) throw new Error("No residence found");
    console.log("[MMM-LevitonPanel] Residence:", this.residenceId);

    this.panels = [];

    try {
      const ldata = await this._get(
        `/Residences/${this.residenceId}/residentialBreakerPanels`,
        { filter: JSON.stringify({ include: ["residentialBreakers"] }) }
      );
      if (Array.isArray(ldata) && ldata.length > 0) {
        ldata.forEach(p => {
          this.panels.push({ id: p.id, type: "ldata" });
          (p.residentialBreakers || []).forEach(b => this._seedBreaker(b));
        });
        console.log("[MMM-LevitonPanel] Found", ldata.length, "LDATA panel(s)");
      }
    } catch (e) { console.log("[MMM-LevitonPanel] No LDATA panels:", e.message); }

    try {
      const whems = await this._get(`/Residences/${this.residenceId}/iotWhems`);
      if (Array.isArray(whems) && whems.length > 0) {
        whems.forEach(p => this.panels.push({ id: p.id, type: "whems" }));
        console.log("[MMM-LevitonPanel] Found", whems.length, "WHEMS panel(s)");
      }
    } catch (e) { console.log("[MMM-LevitonPanel] No WHEMS panels:", e.message); }

    if (this.panels.length === 0) throw new Error("No Leviton smart panels found on this account");
  },

  _seedBreaker(b) {
    if (!b?.id) return;
    const existing = this.breakers[b.id];
    this.breakers[b.id] = {
      name:     b.name ?? ("Circuit " + (b.position ?? b.id)),
      watts:    existing?.watts  ?? (b.power  ?? 0),
      watts2:   existing?.watts2 ?? (b.power2 ?? 0),
      state:    b.currentState ?? existing?.state ?? "ON",
      position: b.position ?? 0,
      poles:    b.poles ?? 1,
    };
  },

  // ── REST helpers ──────────────────────────────────────────────────────────

  async _get(path, extraHeaders = {}, retried = false) {
    const res = await fetch(BASE + path, { headers: { Authorization: this.token, ...extraHeaders } });
    if (res.status === 401) {
      if (retried) throw new Error("401 after re-auth on " + path);
      await this._authenticate();
      return this._get(path, extraHeaders, true);
    }
    if (!res.ok) throw new Error("HTTP " + res.status + " on " + path);
    return res.json();
  },

  async _put(path, body, retried = false) {
    const res = await fetch(BASE + path, {
      method: "PUT",
      headers: { Authorization: this.token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      if (retried) throw new Error("401 after re-auth on PUT " + path);
      await this._authenticate();
      return this._put(path, body, true);
    }
  },

  async _bandwidthToggle() {
    for (const panel of this.panels) {
      const ep = panel.type === "whems" ? `/IotWhems/${panel.id}` : `/ResidentialBreakerPanels/${panel.id}`;
      try {
        await this._put(ep, { bandwidth: 1 });
        await this._put(ep, { bandwidth: 0 });
        await this._put(ep, { bandwidth: 1 });
      } catch (e) { console.warn("[MMM-LevitonPanel] Bandwidth toggle failed:", e.message); }
    }
  },

  async _fetchBreakerRest() {
    for (const panel of this.panels) {
      try {
        const breakers = panel.type === "whems"
          ? await this._get(`/IotWhems/${panel.id}/residentialBreakers`)
          : await this._get(`/ResidentialBreakerPanels/${panel.id}/residentialBreakers`);
        if (Array.isArray(breakers)) breakers.forEach(b => this._seedBreaker(b));
      } catch (e) { console.warn("[MMM-LevitonPanel] REST breaker fetch failed:", e.message); }
    }
    this._integrateWatts();
    this._emitCircuits();
  },

  // ── WebSocket ─────────────────────────────────────────────────────────────

  _openWebSocket() {
    if (this.ws) { try { this.ws.terminate(); } catch (_) {} this.ws = null; }

    console.log("[MMM-LevitonPanel] Opening WebSocket…");
    this.ws = new WebSocket(WS_URL, {
      headers: { Origin: "https://myapp.leviton.com" },
      perMessageDeflate: true,
    });

    this.ws.on("open", () => {
      console.log("[MMM-LevitonPanel] WebSocket open — authenticating");
      this._wsSend({ token: { id: this.token, userId: this.userId, ttl: 5184000, created: new Date().toISOString(), scopes: null } });
    });

    this.ws.on("message", raw => {
      try { this._handleWsMessage(JSON.parse(raw)); }
      catch (e) { console.warn("[MMM-LevitonPanel] WS parse error:", e.message); }
    });

    this.ws.on("error", e => console.error("[MMM-LevitonPanel] WebSocket error:", e.message));
    this.ws.on("close", () => {
      console.warn("[MMM-LevitonPanel] WebSocket closed — reconnecting in 10s");
      setTimeout(() => this._openWebSocket(), 10000);
    });
  },

  _handleWsMessage(msg) {
    if (msg?.status === "ready") {
      console.log("[MMM-LevitonPanel] WS ready — subscribing");
      this._subscribeAll();
      return;
    }
    if (msg?.type !== "notification") return;

    const { modelName: model, modelId: id, data } = msg.notification ?? {};
    if (!data || !id) return;

    if (model === "ResidentialBreaker") {
      const b = this.breakers[id];
      if (!b) return;
      const prevState = b.state;
      if (data.power  !== undefined) b.watts  = data.power  ?? 0;
      if (data.power2 !== undefined) b.watts2 = data.power2 ?? 0;
      if (data.currentState !== undefined) b.state = data.currentState;

      if (b.state === "TRIPPED" && prevState !== "TRIPPED")
        this.sendSocketNotification("LEVITON_TRIP", { circuitName: b.name });
      else if (prevState === "TRIPPED" && b.state !== "TRIPPED")
        this.sendSocketNotification("LEVITON_CLEAR", { circuitName: b.name });

      this._integrateWatts();
      this._emitCircuits();
    }
  },

  _subscribeAll() {
    this._wsSend({ type: "subscribe", subscription: { modelName: "Residence", modelId: String(this.residenceId) } });
    for (const panel of this.panels) {
      const m = panel.type === "whems" ? "IotWhem" : "ResidentialBreakerPanel";
      this._wsSend({ type: "subscribe", subscription: { modelName: m, modelId: String(panel.id) } });
    }
    for (const id of Object.keys(this.breakers)) {
      this._wsSend({ type: "subscribe", subscription: { modelName: "ResidentialBreaker", modelId: String(id) } });
    }
  },

  _wsSend(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  },

  // ── Timers ────────────────────────────────────────────────────────────────

  _startHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      try { await fetch(BASE + "/apiversion", { headers: { Authorization: this.token } }); } catch (_) {}
    }, HEARTBEAT_MS);
  },

  _startBandwidthKeepalive() {
    clearInterval(this.bandwidthTimer);
    this.bandwidthTimer = setInterval(() => {
      for (const panel of this.panels) {
        const ep = panel.type === "whems" ? `/IotWhems/${panel.id}` : `/ResidentialBreakerPanels/${panel.id}`;
        this._put(ep, { bandwidth: 1 }).catch(() => {});
      }
    }, BANDWIDTH_MS);
  },

  _startEnergyPolling() {
    clearInterval(this.energyTimer);
    this.energyTimer = setInterval(async () => {
      await this._bandwidthToggle();
      await this._fetchBreakerRest();
    }, ENERGY_POLL_MS);
  },

  _startAccumSaving() {
    clearInterval(this.accumSaveTimer);
    this.accumSaveTimer = setInterval(() => { this._saveAccum(); this._saveHistory(); }, ACCUM_SAVE_MS);
  },

  _scheduleWsReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log("[MMM-LevitonPanel] Proactive WS reconnect");
      this._openWebSocket();
      this._scheduleWsReconnect();
    }, WS_RECONNECT_MS);
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  _todayKey() {
    const d = new Date();
    return d.getFullYear() + "-"
      + String(d.getMonth() + 1).padStart(2, "0") + "-"
      + String(d.getDate()).padStart(2, "0");
  },

  // ── Emit ──────────────────────────────────────────────────────────────────

  _emitCircuits() {
    const circuits = Object.values(this.breakers).map(b => ({
      name:     b.name,
      watts:    (b.watts ?? 0) + (b.watts2 ?? 0),
      state:    b.state,
      position: b.position,
      poles:    b.poles,
    }));

    const totalWatts = circuits.reduce((s, c) => s + c.watts, 0);
    this.sendSocketNotification("LEVITON_CIRCUITS", { totalWatts, circuits });
    const historySnapshot = Object.assign({}, this.kwhHistory, { [this._todayKey()]: this.kwhToday });
    this.sendSocketNotification("LEVITON_DAILY", {
      kwhToday: this.kwhToday,
      estimatedCost: this.kwhToday * (this.config.costPerKwh ?? 0.12),
      kwhHistory: historySnapshot,
    });
  },

});
