const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "token.json");
const CREDENTIALS_FILE = path.join(__dirname, "credentials.json");

const FLUME_TOKEN_URL = "https://api.flumewater.com/oauth/token";
const FLUME_API_BASE = "https://api.flumewater.com";

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-FlumeWater] helper started");
    this.config = null;
    this.token = null;
    this.userId = null;
    this.deviceId = null;
    this._loadToken();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FLUME_WATER_START") {
      this.config = payload.config;
      this._init();
    }
    if (notification === "FLUME_WATER_FETCH") {
      if (this.token && this.deviceId) {
        this._fetch();
      }
    }
  },

  async _init() {
    try {
      await this._ensureFreshToken();
      await this._discoverDevice();
      await this._fetch();
    } catch (e) {
      console.error("[MMM-FlumeWater] Init error:", e.message);
      this.sendSocketNotification("FLUME_WATER_ERROR", { message: e.message });
    }
  },

  // ── Token management ──────────────────────────────────────────────────────

  _loadToken() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        this.token = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
        console.log("[MMM-FlumeWater] Token loaded from disk");
      }
    } catch (e) {
      console.error("[MMM-FlumeWater] Failed to load token:", e.message);
    }
  },

  _saveToken(token) {
    this.token = token;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    console.log("[MMM-FlumeWater] Token saved");
  },

  _isExpired() {
    if (!this.token?.expires_at) return true;
    return Date.now() > this.token.expires_at - 60 * 1000;
  },

  async _ensureFreshToken(attempt = 1) {
    if (!this._isExpired()) return;

    const creds = this._loadCredentials();
    if (!creds) throw new Error("credentials.json missing — see module README");

    console.log(`[MMM-FlumeWater] Fetching access token (attempt ${attempt})...`);
    try {
      // Flume uses Resource Owner Password Credentials grant
      const res = await fetch(FLUME_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "password",
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          username: creds.username,
          password: creds.password,
        }),
      });

      const data = await res.json();
      if (!data.data?.[0]?.access_token) {
        throw new Error("Token fetch failed: " + JSON.stringify(data));
      }

      const tokenData = data.data[0];
      this._saveToken({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        // Flume tokens expire in 604800s (7 days) by default
        expires_at: Date.now() + (tokenData.expires_in || 604800) * 1000,
      });

      // Decode user_id from JWT payload
      this.userId = this._decodeUserId(tokenData.access_token);
      console.log("[MMM-FlumeWater] Token acquired, userId:", this.userId);

    } catch (e) {
      if (attempt < 3) {
        console.warn("[MMM-FlumeWater] Token fetch failed, retrying in 5s...");
        await new Promise(r => setTimeout(r, 5000));
        return this._ensureFreshToken(attempt + 1);
      }
      throw e;
    }
  },

  _decodeUserId(jwt) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
      return payload.user_id || payload.sub || null;
    } catch (e) {
      return null;
    }
  },

  _loadCredentials() {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    } catch (e) {
      console.error("[MMM-FlumeWater] credentials.json missing:", e.message);
      return null;
    }
  },

  // ── Device discovery ──────────────────────────────────────────────────────

  async _discoverDevice() {
    if (!this.userId) {
      // Try loading from saved token
      if (this.token?.access_token) {
        this.userId = this._decodeUserId(this.token.access_token);
      }
      if (!this.userId) throw new Error("Cannot determine user ID");
    }

    const res = await this._apiGet(`/users/${this.userId}/devices`);
    // type 2 = Flume Smart Home Water Monitor (the sensor bridge)
    const sensor = (res.data || []).find(d => d.type === 2 && d.connected);
    if (!sensor) throw new Error("No connected Flume sensor found");
    this.deviceId = sensor.id;
    console.log("[MMM-FlumeWater] Found device:", this.deviceId);
  },

  // ── API calls ─────────────────────────────────────────────────────────────

  async _apiGet(path) {
    await this._ensureFreshToken();
    const res = await fetch(FLUME_API_BASE + path, {
      headers: { Authorization: "Bearer " + this.token.access_token },
    });
    if (!res.ok) throw new Error(`API GET ${path} returned ${res.status}`);
    return res.json();
  },

  async _apiPost(path, body) {
    await this._ensureFreshToken();
    const res = await fetch(FLUME_API_BASE + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API POST ${path} returned ${res.status}`);
    return res.json();
  },

  async _fetch() {
    try {
      const [flowData, historyData] = await Promise.all([
        this._fetchCurrentFlow(),
        this._fetchMonthHistory(),
      ]);

      this.sendSocketNotification("FLUME_WATER_DATA", {
        flow_rate: flowData.flow_rate,
        today_gallons: flowData.today_gallons,
        month_data: historyData,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      console.error("[MMM-FlumeWater] Fetch error:", e.message);
      this.sendSocketNotification("FLUME_WATER_ERROR", { message: e.message });
    }
  },

  _fmtLocal(d) {
    // Format a Date as "YYYY-MM-DD HH:MM:SS" in America/Los_Angeles
    // LA is UTC-8 (PST) or UTC-7 (PDT); Intl.DateTimeFormat handles DST correctly
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = t => p.find(x => x.type === t).value;
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  },

  async _fetchCurrentFlow() {
    const now = new Date();
    const fmt = d => this._fmtLocal(d);

    // Last 2 minutes for current flow rate (gpm)
    const since = new Date(now.getTime() - 2 * 60 * 1000);

    // Midnight today in local time
    const todayStart = fmt(now).slice(0, 10) + " 00:00:00";

    const body = {
      queries: [
        {
          request_id: "current",
          since_datetime: fmt(since),
          until_datetime: fmt(now),
          bucket: "MIN",
          units: "GALLONS",
          operation: "SUM",
        },
        {
          request_id: "today",
          since_datetime: todayStart,
          until_datetime: fmt(now),
          bucket: "DAY",
          units: "GALLONS",
          operation: "SUM",
        },
      ],
    };

    const data = await this._apiPost(
      `/users/${this.userId}/devices/${this.deviceId}/query`,
      body
    );

    // Response: data[0] is an object keyed by request_id, each value is [{value: N}]
    const result = data.data?.[0] || {};
    const flowRate = result.current?.[0]?.value ?? 0;
    const todayGallons = result.today?.[0]?.value ?? 0;

    return { flow_rate: flowRate, today_gallons: todayGallons };
  },

  async _fetchMonthHistory() {
    const now = new Date();
    const fmt = d => this._fmtLocal(d);
    const localNow = fmt(now);
    const year = parseInt(localNow.slice(0, 4));
    const month = parseInt(localNow.slice(5, 7));
    const todayDay = parseInt(localNow.slice(8, 10));
    const daysInMonth = new Date(year, month, 0).getDate();

    // One query per day — Flume only returns a single value per DAY bucket query
    const pad = n => String(n).padStart(2, "0");
    const queries = [];
    for (let d = 1; d <= Math.min(todayDay, daysInMonth); d++) {
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      queries.push({
        request_id: `day_${dateStr}`,
        since_datetime: `${dateStr} 00:00:00`,
        until_datetime: d === todayDay ? localNow : `${dateStr} 23:59:59`,
        bucket: "DAY",
        units: "GALLONS",
        operation: "SUM",
      });
    }

    const data = await this._apiPost(
      `/users/${this.userId}/devices/${this.deviceId}/query`,
      { queries }
    );

    const monthData = {};
    for (const result of (data.data || [])) {
      for (const [reqId, entries] of Object.entries(result)) {
        if (reqId.startsWith("day_")) {
          const dateKey = reqId.slice(4); // "YYYY-MM-DD"
          const val = Array.isArray(entries) ? (entries[0]?.value || 0) : 0;
          monthData[dateKey] = val;
        }
      }
    }

    return monthData;
  },

});
