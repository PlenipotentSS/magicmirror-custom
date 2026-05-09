Module.register("MMM-RivianCar", {

  defaults: {
    updateInterval: 5 * 60 * 1000,
    username: "",
    password: "",
    showCarImage: true,
  },

  getStyles() {
    return ["MMM-RivianCar.css"];
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
    this.needsOtp = false;
    this.lastUpdated = null;
    this.sendSocketNotification("RIVIAN_START", { config: this.config });
    setInterval(() => {
      this.sendSocketNotification("RIVIAN_FETCH", {});
    }, this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-RivianCar";

    if (this.needsOtp) {
      wrapper.appendChild(this._makeOtpPrompt());
      return wrapper;
    }

    if (this.error) {
      const err = document.createElement("div");
      err.className = "rivian-error dimmed small";
      err.innerText = this.error;
      wrapper.appendChild(err);
      return wrapper;
    }

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Loading Rivian...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const d = this.carData;

    // ── Car image ──────────────────────────────────────────────────────────
    if (this.config.showCarImage) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "rivian-image-wrap";
      const img = document.createElement("img");
      img.src = this.file("rivian.png");
      img.className = "rivian-car-img";
      img.alt = "Rivian";
      imgWrap.appendChild(img);
      wrapper.appendChild(imgWrap);
    }

    // ── Battery bar ────────────────────────────────────────────────────────
    if (d.chargePercent !== null) {
      const battWrap = document.createElement("div");
      battWrap.className = "rivian-battery-wrap";

      const battOuter = document.createElement("div");
      battOuter.className = "rivian-battery-outer";

      const battFill = document.createElement("div");
      battFill.className = "rivian-battery-fill " + this._battClass(d.chargePercent);
      battFill.style.width = Math.round(d.chargePercent) + "%";
      battOuter.appendChild(battFill);

      const battTip = document.createElement("div");
      battTip.className = "rivian-battery-tip";
      battOuter.appendChild(battTip);

      const battPct = document.createElement("span");
      battPct.className = "rivian-battery-pct bright";
      battPct.innerText = Math.round(d.chargePercent) + "%";

      battWrap.appendChild(battOuter);
      battWrap.appendChild(battPct);
      wrapper.appendChild(battWrap);

      if (d.remainingRange !== null) {
        const range = document.createElement("div");
        range.className = "rivian-range";
        range.innerText = Math.round(d.remainingRange * 0.621371) + " mi range";
        wrapper.appendChild(range);
      }
    }

    // ── Charging status ────────────────────────────────────────────────────
    if (d.chargeState && d.chargeState !== "charging_idle" && d.chargeState !== "charging_ready" && d.chargeState !== "idle" && d.chargeState !== "") {
      const chgRow = document.createElement("div");
      chgRow.className = "rivian-row";

      const isCharging = d.chargeState.includes("charging");
      chgRow.innerHTML = `<span class="rivian-icon">${isCharging ? "⚡" : "🔌"}</span>` +
        `<span class="rivian-label small">${this._chargeLabel(d.chargeState, d.timeToEndCharge)}</span>`;
      wrapper.appendChild(chgRow);
    }

    // ── Lock / Drive status ────────────────────────────────────────────────
    const isDriving = d.gearStatus === "drive" || d.gearStatus === "reverse";
    const lockRow = document.createElement("div");
    lockRow.className = "rivian-row";
    const isLocked = d.locked === "locked";
    lockRow.innerHTML =
      `<span class="rivian-icon">${isDriving ? "🚗" : isLocked ? "🔒" : "🔓"}</span>` +
      `<span class="rivian-label small ${isDriving || isLocked ? "rivian-ok" : "rivian-warn"}">` +
      `${isDriving ? "Driving" : isLocked ? "Locked" : "Unlocked"}</span>`;
    wrapper.appendChild(lockRow);

    // ── Open doors warning ─────────────────────────────────────────────────
    if (d.openDoors && d.openDoors.length > 0) {
      const doorRow = document.createElement("div");
      doorRow.className = "rivian-row rivian-warn";
      doorRow.innerText = "⚠ Open: " + d.openDoors.join(", ");
      wrapper.appendChild(doorRow);
    }

    // ── Open windows warning ───────────────────────────────────────────────
    if (d.windowsOpen) {
      const winRow = document.createElement("div");
      winRow.className = "rivian-row rivian-warn";
      winRow.innerText = "⚠ Windows open";
      wrapper.appendChild(winRow);
    }

    return wrapper;
  },

  _makeOtpPrompt() {
    const wrap = document.createElement("div");
    wrap.className = "rivian-otp-wrap";

    const msg = document.createElement("div");
    msg.className = "small dimmed";
    msg.innerText = "Rivian 2FA: check your phone for a code";
    wrap.appendChild(msg);

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 6;
    input.className = "rivian-otp-input";
    input.placeholder = "Enter code";
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.className = "rivian-otp-btn";
    btn.innerText = "Submit";
    btn.addEventListener("click", () => {
      const code = input.value.trim();
      if (code.length >= 4) {
        this.sendSocketNotification("RIVIAN_OTP", { otpCode: code });
        this.needsOtp = false;
        this.updateDom();
      }
    });
    wrap.appendChild(btn);
    return wrap;
  },

  _battClass(pct) {
    if (pct <= 15) return "batt-critical";
    if (pct <= 30) return "batt-low";
    if (pct <= 60) return "batt-mid";
    return "batt-high";
  },

  _chargeLabel(state, minsRemaining) {
    const labels = {
      "charging_ac":        "Charging (AC)",
      "charging_dc":        "Charging (DC)",
      "charging_scheduled": "Scheduled",
      "charging_paused":    "Charge paused",
      "charging_complete":  "Charged",
      "plugged_in":         "Plugged in",
      "connected":          "Plugged in",
    };
    let label = labels[state] || (state.includes("charging") ? "Charging" : state);
    if (minsRemaining && minsRemaining > 0) {
      const h = Math.floor(minsRemaining / 60);
      const m = minsRemaining % 60;
      label += h > 0 ? ` · ${h}h ${m}m` : ` · ${m}m`;
    }
    return label;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "RIVIAN_DATA") {
      this.carData = payload;
      this.loaded = true;
      this.error = null;
      this.needsOtp = false;
      this.lastUpdated = Date.now();
      this.updateDom(300);
    }
    if (notification === "RIVIAN_ERROR") {
      this.error = payload.message;
      this.updateDom();
    }
    if (notification === "RIVIAN_NEED_OTP") {
      this.needsOtp = true;
      this.updateDom();
    }
  },

});
