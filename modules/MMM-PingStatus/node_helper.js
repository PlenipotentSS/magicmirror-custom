const NodeHelper = require("node_helper");
const path = require("path");

const ping = require(
  require.resolve("ping", {
    paths: [path.join(__dirname, "node_modules")]
  })
);

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-PingStatus] helper started");
    this.config = null;
    this.pollTimer = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "PING_INIT") {
      this.config = payload;
      this._poll();
      this.pollTimer = setInterval(() => this._poll(), this.config.updateInterval);
    }
  },

  async _poll() {
    const results = await Promise.all(
      this.config.hosts.map(async host => {
        try {
          const res = await ping.promise.probe(host, {
            timeout: 5,
            extra: ["-c", "1"],
          });
          return {
            host,
            alive: res.alive,
            latency: res.alive ? parseFloat(res.time) : null,
          };
        } catch (e) {
          return { host, alive: false, latency: null };
        }
      })
    );
    this.sendSocketNotification("PING_DATA", results);
  },

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  },

});
