Module.register("MMM-DadJoke", {

  defaults: {
    updateInterval: 12 * 60 * 60 * 1000, // check every 12 hours (aligns to AM/PM slots)
  },

  start() {
    this.joke = "";
    this.sendSocketNotification("GET_JOKE");

    // Schedule refreshes aligned to next slot boundary (noon or midnight)
    this.scheduleNextRefresh();
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-DadJoke";

    if (this.joke) {
      const text = document.createElement("div");
      text.className = "joke-text";
      text.innerText = this.joke;
      wrapper.appendChild(text);
    }

    return wrapper;
  },

  scheduleNextRefresh() {
    const now  = new Date();
    const next = new Date(now);

    // Find next noon or midnight
    if (now.getHours() < 12) {
      next.setHours(12, 0, 5, 0); // noon + 5s buffer
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 5, 0); // midnight + 5s buffer
    }

    const delay = next - now;
    setTimeout(() => {
      this.sendSocketNotification("GET_JOKE");
      this.scheduleNextRefresh();
    }, delay);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "JOKE_RESULT") {
      this.joke = payload.joke;
      this.updateDom(500);
    }
  },

});
