const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const TOKEN_FILE = path.join(__dirname, "token.json");
const CREDENTIALS_FILE = path.join(__dirname, "credentials.json");
const SOLAR_LOG_FILE = path.join(__dirname, "solar_log.json");

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";
const TESLA_API_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";

// Scopes needed for energy site data
const SCOPES = "openid offline_access energy_device_data";

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-TeslaEnergy] helper started");
    this.config = null;
    this.token = null;
    this.siteId = null;
    this.solarLog = this._loadSolarLog();
    this._loadToken();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "TESLA_ENERGY_START") {
      this.config = payload.config;
      if (this.token) {
        this._discoverSite().then(() => this._fetch());
      } else {
        console.warn("[MMM-TeslaEnergy] No token found. Run authorize.js first.");
        this.sendSocketNotification("TESLA_ENERGY_ERROR", {
          message: "Not authorized. Run: node modules/MMM-TeslaEnergy/authorize.js"
        });
      }
    }
    if (notification === "TESLA_ENERGY_FETCH") {
      if (this.token && this.siteId) {
        this._fetch();
      }
    }
  },

  // ── Token management ──────────────────────────────────────────────────────

  _loadToken() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        this.token = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
        console.log("[MMM-TeslaEnergy] Token loaded from disk");
      }
    } catch (e) {
      console.error("[MMM-TeslaEnergy] Failed to load token:", e.message);
    }
  },

  _saveToken(token) {
    this.token = token;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    console.log("[MMM-TeslaEnergy] Token saved");
  },

  async _refreshToken(attempt = 1) {
    const creds = this._loadCredentials();
    if (!creds) throw new Error("No credentials.json found");

    console.log(`[MMM-TeslaEnergy] Refreshing access token (attempt ${attempt})...`);
    try {
      const res = await fetch(TESLA_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: creds.client_id,
          refresh_token: this.token.refresh_token,
        }).toString(),
      });

      const data = await res.json();
      if (!data.access_token) throw new Error("Token refresh failed: " + JSON.stringify(data));

      this._saveToken({
        access_token: data.access_token,
        refresh_token: data.refresh_token || this.token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 28800) * 1000,
      });
      console.log("[MMM-TeslaEnergy] Token refreshed, expires:", new Date(this.token.expires_at).toISOString());
    } catch (e) {
      if (attempt < 3) {
        console.warn(`[MMM-TeslaEnergy] Token refresh failed, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        return this._refreshToken(attempt + 1);
      }
      throw e;
    }
  },

  _isExpired() {
    if (!this.token?.expires_at) return true;
    return Date.now() > this.token.expires_at - 60 * 1000;
  },

  async _ensureFreshToken() {
    if (this._isExpired()) {
      await this._refreshToken();
    }
  },

  _loadCredentials() {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    } catch (e) {
      console.error("[MMM-TeslaEnergy] credentials.json missing:", e.message);
      return null;
    }
  },

  // ── Solar log ─────────────────────────────────────────────────────────────

  _loadSolarLog() {
    try {
      if (fs.existsSync(SOLAR_LOG_FILE)) {
        return JSON.parse(fs.readFileSync(SOLAR_LOG_FILE, "utf8"));
      }
    } catch (e) {
      console.error("[MMM-TeslaEnergy] Failed to load solar log:", e.message);
    }
    return {};
  },

  _saveSolarLog() {
    try {
      fs.writeFileSync(SOLAR_LOG_FILE, JSON.stringify(this.solarLog, null, 2));
    } catch (e) {
      console.error("[MMM-TeslaEnergy] Failed to save solar log:", e.message);
    }
  },

  _todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },

  _monthPrefix() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },

  _accumulateSolar(solarWatts) {
    const now = Date.now();
    const todayKey = this._todayKey();

    // Reset lastFetchTime if it's from a previous day
    if (this.solarLog._lastFetchDay && this.solarLog._lastFetchDay !== todayKey) {
      this.solarLog._lastFetchTime = null;
    }

    const lastFetchTime = this.solarLog._lastFetchTime || null;

    if (lastFetchTime) {
      const elapsedHours = (now - lastFetchTime) / (1000 * 60 * 60);
      // Only accumulate if interval is reasonable (< 30 min gap, avoids restart spikes)
      if (solarWatts > 0 && elapsedHours < 0.5) {
        const wh = solarWatts * elapsedHours;
        this.solarLog[todayKey] = (this.solarLog[todayKey] || 0) + wh;
      }
    }

    this.solarLog._lastFetchTime = now;
    this.solarLog._lastFetchDay = todayKey;
    this._pruneOldLogs();
    this._saveSolarLog();
  },

  _pruneOldLogs() {
    // Keep only current month + previous month
    const now = new Date();
    const keepMonths = new Set([
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`,
    ]);
    for (const key of Object.keys(this.solarLog)) {
      if (key.startsWith("_")) continue;
      const month = key.slice(0, 7);
      if (!keepMonths.has(month)) delete this.solarLog[key];
    }
  },

  _getMonthData() {
    const prefix = this._monthPrefix();
    const result = {};
    for (const [key, wh] of Object.entries(this.solarLog)) {
      if (key.startsWith(prefix)) {
        result[key] = wh;
      }
    }
    return result;
  },

  // ── API calls ─────────────────────────────────────────────────────────────

  async _discoverSite() {
    if (this.config?.siteId) {
      this.siteId = this.config.siteId;
      return;
    }
    try {
      await this._ensureFreshToken();
      const res = await fetch(`${TESLA_API_BASE}/api/1/products`, {
        headers: { Authorization: "Bearer " + this.token.access_token },
      });
      const data = await res.json();
      const energySite = (data.response || []).find(p => p.energy_site_id);
      if (energySite) {
        this.siteId = energySite.energy_site_id;
        console.log("[MMM-TeslaEnergy] Discovered site ID:", this.siteId);
      } else {
        throw new Error("No energy site found in Tesla account");
      }
    } catch (e) {
      console.error("[MMM-TeslaEnergy] Site discovery failed:", e.message);
      this.sendSocketNotification("TESLA_ENERGY_ERROR", { message: "Site discovery failed: " + e.message });
    }
  },

  async _fetch() {
    if (!this.siteId) {
      await this._discoverSite();
      if (!this.siteId) return;
    }

    try {
      await this._ensureFreshToken();
      const res = await fetch(
        `${TESLA_API_BASE}/api/1/energy_sites/${this.siteId}/live_status`,
        { headers: { Authorization: "Bearer " + this.token.access_token } }
      );

      if (res.status === 401) {
        // Force refresh and retry once
        await this._refreshToken();
        return this._fetch();
      }

      const data = await res.json();
      const r = data.response;

      if (!r) throw new Error("Empty response from live_status");

      this._accumulateSolar(r.solar_power ?? 0);

      const todayKey = this._todayKey();
      this.sendSocketNotification("TESLA_ENERGY_DATA", {
        solar_power: r.solar_power ?? null,
        load_power: r.load_power ?? null,
        grid_power: r.grid_power ?? null,
        percentage_charged: r.percentage_charged ?? null,
        grid_status: r.grid_status ?? null,
        storm_mode_active: r.storm_mode_active ?? false,
        solar_energy_today: this.solarLog[todayKey] ?? 0,
        solar_month_data: this._getMonthData(),
        lastUpdated: Date.now(),
      });

    } catch (e) {
      console.error("[MMM-TeslaEnergy] Fetch error:", e.message);
      this.sendSocketNotification("TESLA_ENERGY_ERROR", { message: e.message });
    }
  },

});
