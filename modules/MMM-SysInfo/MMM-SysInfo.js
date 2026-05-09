Module.register("MMM-SysInfo", {
  defaults: {
    updateInterval: 10000,
  },

  getStyles() {
    return ["MMM-SysInfo.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.info = null;
    this.lastUpdated = null;
    this.sendSocketNotification("START", { updateInterval: this.config.updateInterval });
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-SysInfo";

    if (!this.info) {
      wrapper.innerText = "Loading...";
      return wrapper;
    }

    const row = (label, value) => {
      const el = document.createElement("span");
      el.className = "sysinfo-item";
      el.innerHTML = `<span class="sysinfo-label">${label}</span><span class="sysinfo-value">${value}</span>`;
      return el;
    };

    const statsRow = document.createElement("div");
    statsRow.className = "sysinfo-row";
    statsRow.appendChild(row("CPU", this.info.cpu));
    statsRow.appendChild(row("MEM", this.info.mem));
    statsRow.appendChild(row("TEMP", this.info.temp));
    statsRow.appendChild(row("UP", this.info.uptime));
    wrapper.appendChild(statsRow);

    return wrapper;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "SYSINFO_UPDATE") {
      this.info = payload;
      this.lastUpdated = Date.now();
      this.updateDom();
    }
  },
});
