Module.register("MMM-LucidCar", {

  defaults: {
    updateInterval: 5 * 60 * 1000,
    username: "",
    password: "",
    showCarImage: true,
  },

  getStyles() {
    return ["MMM-LucidCar.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.carData = null;
    this.error = null;
    this.loaded = false;
    this.lastUpdated = null;
    this.sendSocketNotification("LUCID_START", { config: this.config });
    setInterval(() => {
      this.sendSocketNotification("LUCID_FETCH", {});
    }, this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-LucidCar";

    if (this.error) {
      const err = document.createElement("div");
      err.className = "lucid-error dimmed small";
      err.innerText = this.error;
      wrapper.appendChild(err);
      return wrapper;
    }

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Loading Lucid...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const d = this.carData;

    // ── Car image ──────────────────────────────────────────────────────────────
    if (this.config.showCarImage) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "lucid-image-wrap";
      const img = document.createElement("img");
      img.src = this.file("lucid.png");
      img.className = "lucid-car-img";
      img.alt = "Lucid Air";
      imgWrap.appendChild(img);
      wrapper.appendChild(imgWrap);
    }

    // ── Battery bar ────────────────────────────────────────────────────────────
    if (d.chargePercent !== null) {
      const battWrap = document.createElement("div");
      battWrap.className = "lucid-battery-wrap";

      const battOuter = document.createElement("div");
      battOuter.className = "lucid-battery-outer";

      const battFill = document.createElement("div");
      battFill.className = "lucid-battery-fill " + this._battClass(d.chargePercent);
      battFill.style.width = Math.round(d.chargePercent) + "%";
      battOuter.appendChild(battFill);

      const battTip = document.createElement("div");
      battTip.className = "lucid-battery-tip";
      battOuter.appendChild(battTip);

      const battPct = document.createElement("span");
      battPct.className = "lucid-battery-pct bright";
      battPct.innerText = Math.round(d.chargePercent) + "%";

      battWrap.appendChild(battOuter);
      battWrap.appendChild(battPct);
      wrapper.appendChild(battWrap);

      if (d.remainingRange !== null) {
        const range = document.createElement("div");
        range.className = "lucid-range";
        range.innerText = Math.round(d.remainingRange) + " mi range";
        wrapper.appendChild(range);
      }
    }

    // ── Charging status ────────────────────────────────────────────────────────
    if (d.chargeState && d.chargeState !== "not_connected" && d.chargeState !== "unknown") {
      const chgRow = document.createElement("div");
      chgRow.className = "lucid-row";

      const chgIcon = document.createElement("span");
      chgIcon.className = "lucid-icon";
      chgIcon.innerText = d.chargeState === "charging" ? "⚡" : "🔌";

      const chgText = document.createElement("span");
      chgText.className = "lucid-label small";
      let chgLabel = this._chargeLabel(d.chargeState);
      if (d.chargeState === "charging" && d.chargeRateKw) {
        chgLabel += " · " + d.chargeRateKw.toFixed(1) + " kW";
      }
      chgText.innerText = chgLabel;

      chgRow.appendChild(chgIcon);
      chgRow.appendChild(chgText);
      wrapper.appendChild(chgRow);
    }

    // ── Lock / Drive status ────────────────────────────────────────────────────
    const isDriving = d.powerState === "drive";
    const lockRow = document.createElement("div");
    lockRow.className = "lucid-row";

    const lockIcon = document.createElement("span");
    lockIcon.className = "lucid-icon";
    lockIcon.innerText = isDriving ? "🚗" : d.locked === "locked" ? "🔒" : "🔓";

    const lockText = document.createElement("span");
    lockText.className = "lucid-label small " + (isDriving || d.locked === "locked" ? "lucid-ok" : "lucid-warn");
    lockText.innerText = isDriving ? "Driving" : d.locked === "locked" ? "Locked" : "Unlocked";

    lockRow.appendChild(lockIcon);
    lockRow.appendChild(lockText);
    wrapper.appendChild(lockRow);

    // ── Open doors / windows alert ─────────────────────────────────────────────
    const openDoors = this._openDoors(d.doors);
    if (openDoors.length > 0) {
      const doorRow = document.createElement("div");
      doorRow.className = "lucid-row lucid-warn";
      doorRow.innerText = "⚠ Open: " + openDoors.join(", ");
      wrapper.appendChild(doorRow);
    }

    if (d.windowsOpen) {
      const winRow = document.createElement("div");
      winRow.className = "lucid-row lucid-warn";
      winRow.innerText = "⚠ Windows open";
      wrapper.appendChild(winRow);
    }

    return wrapper;
  },

  _battClass(pct) {
    if (pct <= 15) return "batt-critical";
    if (pct <= 30) return "batt-low";
    if (pct <= 60) return "batt-mid";
    return "batt-high";
  },

  _chargeLabel(state) {
    const labels = {
      charging: "Charging",
      complete: "Charged",
      scheduled: "Scheduled",
      connected: "Plugged in",
      establishing: "Connecting…",
      stopped: "Charge stopped",
      paused: "Charge paused",
      error: "Charge error",
    };
    return labels[state] || state;
  },

  _openDoors(doors) {
    const labels = {
      frontLeft: "FL door", frontRight: "FR door",
      rearLeft: "RL door", rearRight: "RR door",
      frunk: "Frunk", trunk: "Trunk",
    };
    return Object.entries(doors)
      .filter(([k, v]) => k !== "chargePort" && (v === "open" || v === "ajar"))
      .map(([k]) => labels[k] || k);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "LUCID_DATA") {
      this.carData = payload;
      this.loaded = true;
      this.error = null;
      this.lastUpdated = Date.now();
      this.updateDom(300);
    }
    if (notification === "LUCID_ERROR") {
      this.error = payload.message;
      this.updateDom();
    }
  },

});
