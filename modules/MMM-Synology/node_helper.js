const NodeHelper = require("node_helper");
const https = require("https");
const path = require("path");

const nodeFetch = require(
  require.resolve("node-fetch", {
    paths: [path.join(__dirname, "node_modules")]
  })
);

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-Synology] helper started");
    this.config = null;
    this.sid = null;
    this.pollTimer = null;
    this.lastRaidStatus = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      this._login().then(() => {
        this._poll();
        this.pollTimer = setInterval(() => this._poll(), this.config.updateInterval);
      }).catch(e => {
        console.error("[MMM-Synology] Login failed:", e.message);
      });
    }
  },

  _baseUrl() {
    const proto = this.config.useHttps ? "https" : "http";
    return `${proto}://${this.config.host}:${this.config.port}/webapi`;
  },

  async _fetch(url) {
    const opts = this.config.useHttps
      ? { agent: new https.Agent({ rejectUnauthorized: false }) }
      : {};
    const res = await nodeFetch(url, opts);
    return res.json();
  },

  async _login() {
    const url = `${this._baseUrl()}/entry.cgi?api=SYNO.API.Auth&version=7&method=login` +
      `&account=${encodeURIComponent(this.config.username)}` +
      `&passwd=${encodeURIComponent(this.config.password)}`;

    const data = await this._fetch(url);
    if (!data.success) throw new Error("Login failed: " + JSON.stringify(data));
    this.sid = data.data.sid;
    console.log("[MMM-Synology] Logged in, sid acquired");
  },

  async _logout() {
    if (!this.sid) return;
    const url = `${this._baseUrl()}/entry.cgi?api=SYNO.API.Auth&version=7&method=logout&_sid=${this.sid}`;
    await this._fetch(url).catch(() => {});
    this.sid = null;
  },

  async _apiGet(params) {
    const url = `${this._baseUrl()}/entry.cgi?${params}&_sid=${this.sid}`;
    const data = await this._fetch(url);
    if (!data.success) {
      // Session expired — re-login and retry once
      console.warn("[MMM-Synology] Session expired, re-logging in...");
      await this._login();
      const retryUrl = `${this._baseUrl()}/entry.cgi?${params}&_sid=${this.sid}`;
      const retryData = await this._fetch(retryUrl);
      if (!retryData.success) throw new Error("API call failed after re-login: " + JSON.stringify(retryData));
      return retryData;
    }
    return data;
  },

  async _poll() {
    try {
      const [storageRes, sysRes, vmRes] = await Promise.all([
        this._apiGet("api=SYNO.Storage.CGI.Storage&version=1&method=load_info"),
        this._apiGet("api=SYNO.Core.System&version=1&method=info"),
        this._apiGet("api=SYNO.Virtualization.Guest&version=2&method=list"),
      ]);

      const volumes = storageRes.data.volumes || [];
      const disks   = storageRes.data.disks   || [];

      // RAID status + type from first volume
      const vol = volumes[0] || null;
      const raidStatus = vol ? (vol.summary_status || vol.status || "normal") : "normal";
      const raidType   = vol ? (vol.raidType || vol.device_type || "") : "";

      // Volume sizes live under vol.size as string bytes
      const totalBytes = vol ? parseInt(vol.size?.total  || "0", 10) : 0;
      const usedBytes  = vol ? parseInt(vol.size?.used   || "0", 10) : 0;
      const usedPct    = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

      // Drives — slot_id is the bay number, overview_status is health
      const drives = disks
        .filter(d => d.slot_id !== undefined)
        .sort((a, b) => a.slot_id - b.slot_id)
        .map(d => ({
          bay:    d.slot_id,
          status: d.overview_status || d.drive_status_key || "notexist",
          model:  d.model  || "",
          temp:   d.temp   !== undefined ? d.temp : null,
        }));

      // System temp
      let systemTemp = sysRes.data ? (sysRes.data.sys_temp ?? null) : null;
      if (systemTemp !== null && this.config.tempUnit === "F") {
        systemTemp = Math.round((systemTemp * 9 / 5) + 32);
      }

      // Convert drive temps if needed
      if (this.config.tempUnit === "F") {
        drives.forEach(d => {
          if (d.temp !== null) d.temp = Math.round((d.temp * 9 / 5) + 32);
        });
      }

      // VMs
      const vms = (vmRes.data?.guests || []).map(g => ({
        name:    g.name,
        status:  g.status,
        online:  g.is_online,
        ip:      g.ip || null,
        cpuPct:   g.vcpu_usage  != null ? Math.round(g.vcpu_usage)        : null,
        ramUsedMB:  g.ram_used  != null ? Math.round(g.ram_used / 1024)   : null,
        ramTotalMB: g.vram_size != null ? Math.round(g.vram_size / 1024)  : null,
      }));

      const payload = {
        raid:       { status: raidStatus, type: raidType },
        drives,
        volume:     { usedBytes, totalBytes, usedPct },
        systemTemp,
        vms,
      };

      this.sendSocketNotification("SYNOLOGY_DATA", payload);

      // Fire alert immediately on RAID degradation / crash
      if (
        raidStatus !== "normal" &&
        raidStatus !== this.lastRaidStatus
      ) {
        this.sendSocketNotification("SYNOLOGY_ALERT", { type: "raid", status: raidStatus });
      }
      this.lastRaidStatus = raidStatus;

    } catch (e) {
      console.error("[MMM-Synology] Poll error:", e.message);
    }
  },

  _worstRaidStatus(raids) {
    const rank = { crashed: 3, degraded: 2, normal: 1 };
    let worst = "normal";
    for (const r of raids) {
      const s = r.status || "normal";
      if ((rank[s] || 0) > (rank[worst] || 0)) worst = s;
    }
    return worst;
  },

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this._logout();
  },

});
