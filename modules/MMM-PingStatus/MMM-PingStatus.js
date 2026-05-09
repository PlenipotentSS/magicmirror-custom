Module.register("MMM-PingStatus", {

  defaults: {
    hosts:          [],
    updateInterval: 60 * 1000,
  },

  start() {
    this.results = [];
    this.sendSocketNotification("PING_INIT", this.config);
  },

  getStyles() {
    return ["MMM-PingStatus.css"];
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-PingStatus";

    if (this.results.length === 0) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Checking...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    this.results.forEach(r => {
      const row = document.createElement("div");
      row.className = "ping-row";

      const dot = document.createElement("span");
      dot.className = "ping-dot ping-dot-" + (r.alive ? "green" : "red");
      row.appendChild(dot);

      const host = document.createElement("span");
      host.className = "ping-host";
      host.innerText = r.host;
      row.appendChild(host);

      const latency = document.createElement("span");
      latency.className = "ping-latency " + this._latencyClass(r.latency);
      latency.innerText = r.alive
        ? (r.latency !== null ? r.latency.toFixed(1) + " ms" : "— ms")
        : "down";
      row.appendChild(latency);

      wrapper.appendChild(row);
    });

    return wrapper;
  },

  _latencyClass(ms) {
    if (ms === null) return "ping-down";
    if (ms >= 150) return "ping-red";
    if (ms >= 50)  return "ping-yellow";
    return "ping-green";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "PING_DATA") {
      this.results = payload;
      this.updateDom(300);
    }
  },

});
