const NodeHelper = require("node_helper");
const os = require("os");
const { execSync } = require("child_process");

module.exports = NodeHelper.create({
  start() {
    this.interval = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "START") {
      this.sendUpdate();
      this.interval = setInterval(() => this.sendUpdate(), payload.updateInterval);
    }
  },

  sendUpdate() {
    const cpus = os.cpus();
    const cpuLoad = this.getCpuLoad();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPct = Math.round((1 - freeMem / totalMem) * 100);
    const uptimeSec = os.uptime();
    const uptime = this.formatUptime(uptimeSec);
    const temp = this.getCpuTemp();

    this.sendSocketNotification("SYSINFO_UPDATE", {
      cpu: `${cpuLoad}%`,
      mem: `${usedPct}%`,
      temp: temp,
      uptime: uptime,
    });
  },

  getCpuLoad() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) totalTick += cpu.times[type];
      totalIdle += cpu.times.idle;
    }
    if (!this._lastIdle) {
      this._lastIdle = totalIdle;
      this._lastTick = totalTick;
      return 0;
    }
    const idleDiff = totalIdle - this._lastIdle;
    const totalDiff = totalTick - this._lastTick;
    this._lastIdle = totalIdle;
    this._lastTick = totalTick;
    return Math.round((1 - idleDiff / totalDiff) * 100);
  },

  getCpuTemp() {
    try {
      // Pi: read from thermal zone
      const temp = execSync("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null", { timeout: 1000 }).toString().trim();
      if (temp) {
        const c = parseInt(temp) / 1000;
        return `${((c * 9/5) + 32).toFixed(1)}°F`;
      }
    } catch (_) {}
    try {
      // Mac: use osx-cpu-temp or powermetrics (requires sudo, skip)
      const out = execSync("osx-cpu-temp 2>/dev/null", { timeout: 1000 }).toString().trim();
      if (out) return out;
    } catch (_) {}
    return "N/A";
  },

  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },
});
