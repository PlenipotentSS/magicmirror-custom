const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const https = require("https");

const AGENT = new https.Agent({ rejectUnauthorized: false });

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-UnifiNetwork] helper started");
    this.config = null;
    this.authCookie = null;
    this.csrfToken = null;
    this.pollTimers = [];
    this.bwHistory = []; // rolling buffer of { tx, rx } samples
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      // Avoid double-init if frontend reloads
      this.pollTimers.forEach(t => clearInterval(t));
      this.pollTimers = [];
      this.config = payload;
      this._initialize();
    }
  },

  async _initialize() {
    // Prime all data immediately, then start intervals
    await this._fetchAll();

    const c = this.config;
    this.pollTimers.push(setInterval(() => this._fetchWan(),     30000));
    this.pollTimers.push(setInterval(() => this._fetchClients(), 30000));
    this.pollTimers.push(setInterval(() => this._fetchDevices(), 60000));
    this.pollTimers.push(setInterval(() => this._fetchWan(),     15000)); // bandwidth rides on WAN
  },

  async _fetchAll() {
    await Promise.all([
      this._fetchWan(),
      this._fetchClients(),
      this._fetchDevices(),
    ]);
  },

  // ── Auth ─────────────────────────────────────────────────────────────────

  _apiKeyHeaders() {
    return {
      "X-API-KEY": this.config.apiKey,
      "Content-Type": "application/json",
    };
  },

  async _cookieLogin() {
    const c = this.config;
    try {
      const res = await fetch(`https://${c.host}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: c.username, password: c.password }),
        agent: AGENT,
      });
      if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
      const setCookie = res.headers.get("set-cookie") || "";
      const match = setCookie.match(/TOKEN=([^;]+)/);
      if (match) this.authCookie = match[1];
      const json = await res.json();
      this.csrfToken = json.meta && json.meta.rc === "ok"
        ? (res.headers.get("x-csrf-token") || "")
        : "";
      console.log("[MMM-UnifiNetwork] Cookie login succeeded");
    } catch (e) {
      console.error("[MMM-UnifiNetwork] Cookie login failed:", e.message);
    }
  },

  _cookieHeaders() {
    const h = { "Content-Type": "application/json" };
    if (this.authCookie) h["Cookie"] = `TOKEN=${this.authCookie}`;
    if (this.csrfToken)  h["X-CSRF-Token"] = this.csrfToken;
    return h;
  },

  // Try API key first; on 401 fall back to cookie auth then retry once
  async _get(path) {
    const c = this.config;
    const url = `https://${c.host}/proxy/network${path}`;

    // API key path
    if (c.apiKey) {
      let res = await fetch(url, { headers: this._apiKeyHeaders(), agent: AGENT });
      if (res.status !== 401) return res;
      console.warn("[MMM-UnifiNetwork] API key 401 — falling back to cookie auth");
    }

    // Cookie path
    if (!this.authCookie) await this._cookieLogin();
    let res = await fetch(url, { headers: this._cookieHeaders(), agent: AGENT });
    if (res.status === 401) {
      // Cookie expired — re-login once
      this.authCookie = null;
      await this._cookieLogin();
      res = await fetch(url, { headers: this._cookieHeaders(), agent: AGENT });
    }
    return res;
  },

  // ── Fetchers ─────────────────────────────────────────────────────────────

  async _fetchWan() {
    try {
      // Get online status + public IP from health endpoint
      const healthRes = await this._get(`/api/s/${this.config.site}/stat/health`);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const healthJson = await healthRes.json();
      const wan = (healthJson.data || []).find(s => s.subsystem === "wan") || {};
      const isOnline = wan.status === "ok";
      const publicIp = wan.wan_ip || null;
      const latency  = wan.latency || null;

      // Get realtime bandwidth from gateway device stats
      const devRes = await this._get(`/api/s/${this.config.site}/stat/device`);
      let uploadMbps = "0.0", downloadMbps = "0.0";
      if (devRes.ok) {
        const devJson = await devRes.json();
        const gw = (devJson.data || []).find(d => d.type === "ugw" || d.type === "udm" || d.type === "usg");
        if (gw) {
          const uplink = gw.uplink || {};
          uploadMbps   = ((uplink["tx_bytes-r"] || 0) * 8 / 1e6).toFixed(1);
          downloadMbps = ((uplink["rx_bytes-r"] || 0) * 8 / 1e6).toFixed(1);
        }
      }

      const planMbps = this.config.wanSpeedMbps || 1000;
      const utilizationPct = Math.min(100, Math.round((parseFloat(downloadMbps) / planMbps) * 100));

      // Rolling 2-hour buffer (15s interval → 480 samples max)
      this.bwHistory.push({ tx: parseFloat(uploadMbps), rx: parseFloat(downloadMbps) });
      if (this.bwHistory.length > 480) this.bwHistory.shift();

      const avgTx = (this.bwHistory.reduce((s, x) => s + x.tx, 0) / this.bwHistory.length).toFixed(1);
      const avgRx = (this.bwHistory.reduce((s, x) => s + x.rx, 0) / this.bwHistory.length).toFixed(1);
      const avgUtilizationPct = Math.min(100, Math.round((parseFloat(avgRx) / planMbps) * 100));
      const historyMinutes = Math.round((this.bwHistory.length * 15) / 60);

      this.sendSocketNotification("WAN_STATUS", {
        isOnline, uploadMbps, downloadMbps, latency, publicIp,
      });

      this.sendSocketNotification("BANDWIDTH", {
        txMbps: uploadMbps,
        rxMbps: downloadMbps,
        utilizationPct,
        avgTxMbps: avgTx,
        avgRxMbps: avgRx,
        avgUtilizationPct,
        historyMinutes,
      });
    } catch (e) {
      console.error("[MMM-UnifiNetwork] fetchWan error:", e.message);
      this.sendSocketNotification("WAN_STATUS", { isOnline: false });
    }
  },

  async _fetchClients() {
    try {
      const res = await this._get(`/api/s/${this.config.site}/stat/sta`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const clients = json.data || [];

      const wireless = clients.filter(c => !c.is_wired).length;
      const wired    = clients.filter(c =>  c.is_wired).length;

      // Count per SSID
      const bySsid = {};
      clients.filter(c => c.essid).forEach(c => {
        bySsid[c.essid] = (bySsid[c.essid] || 0) + 1;
      });

      this.sendSocketNotification("CLIENT_COUNT", {
        total: clients.length,
        wireless,
        wired,
        bySsid,
      });
    } catch (e) {
      console.error("[MMM-UnifiNetwork] fetchClients error:", e.message);
    }
  },

  async _fetchDevices() {
    try {
      const res = await this._get(`/api/s/${this.config.site}/stat/device`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const devices = (json.data || []).map(d => ({
        name:     d.name || d.mac,
        type:     d.type || "uap",
        isOnline: d.state === 1,
        cpu:      d.system_stats ? d.system_stats.cpu  : (d.cpu || null),
        mem:      d.system_stats ? d.system_stats.mem  : (d.mem || null),
      }));

      this.sendSocketNotification("DEVICE_HEALTH", devices);
    } catch (e) {
      console.error("[MMM-UnifiNetwork] fetchDevices error:", e.message);
    }
  },

});
