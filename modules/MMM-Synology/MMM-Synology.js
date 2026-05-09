Module.register("MMM-Synology", {

  defaults: {
    host:           "",
    port:           5001,
    username:       "magicmirror",
    password:       "",
    useHttps:       true,
    updateInterval: 60 * 1000,
    showDriveModels: false,
    tempUnit:       "C",
  },

  getStyles() {
    return ["MMM-Synology.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.synoData = null;
    this.lastUpdated = null;
    this.sendSocketNotification("INIT", this.config);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-Synology";

    if (!this.synoData) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Loading NAS...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const d = this.synoData;
    const raidStatus = d.raid.status; // "normal" | "degraded" | "crashed"

    // Module-level alert class for border pulse
    if (raidStatus === "degraded") wrapper.classList.add("syno-alert-yellow");
    if (raidStatus === "crashed")  wrapper.classList.add("syno-alert-red");

    // ── Drive bays ───────────────────────────────────────────────────────────
    if (d.drives && d.drives.length > 0) {
      const driveContainer = document.createElement("div");
      driveContainer.className = "syno-drives";

      d.drives.forEach(drive => {
        const block = document.createElement("div");
        block.className = "syno-bay-block syno-bay-" + this._driveStatusClass(drive.status);
        block.title = "Bay " + drive.bay + (drive.model ? " — " + drive.model : "");
        driveContainer.appendChild(block);
      });

      wrapper.appendChild(driveContainer);
    }

    // ── Volume usage bar ─────────────────────────────────────────────────────
    if (d.volume && d.volume.totalBytes > 0) {
      const volContainer = document.createElement("div");
      volContainer.className = "syno-volume";

      const volHeader = document.createElement("div");
      volHeader.className = "syno-vol-header";

      const volLabelEl = document.createElement("span");
      volLabelEl.className = "syno-vol-label dimmed xsmall";
      volLabelEl.innerText = "Storage";
      volHeader.appendChild(volLabelEl);

      const volPctEl = document.createElement("span");
      volPctEl.className = "syno-vol-pct xsmall";
      volPctEl.innerText = `${d.volume.usedPct}% (${this._fmtBytes(d.volume.usedBytes)} / ${this._fmtBytes(d.volume.totalBytes)})`;
      volHeader.appendChild(volPctEl);

      volContainer.appendChild(volHeader);

      const barTrack = document.createElement("div");
      barTrack.className = "syno-bar-track";

      const barFill = document.createElement("div");
      barFill.className = "syno-bar-fill syno-bar-" + this._volColorClass(d.volume.usedPct);
      barFill.style.width = d.volume.usedPct + "%";
      barTrack.appendChild(barFill);

      volContainer.appendChild(barTrack);

      // ── Footer row: RAID left, Temp right ─────────────────────────────────
      const footer = document.createElement("div");
      footer.className = "syno-footer";

      const raidLine = document.createElement("span");
      raidLine.className = "syno-raid syno-raid-" + raidStatus;
      if (raidStatus === "normal")   raidLine.innerText = "RAID: Healthy";
      if (raidStatus === "degraded") raidLine.innerText = "RAID: Degraded ⚠";
      if (raidStatus === "crashed")  raidLine.innerText = "RAID: Crashed ✕";
      footer.appendChild(raidLine);

      if (d.systemTemp !== null && d.systemTemp !== undefined) {
        const tempEl = document.createElement("span");
        tempEl.className = "syno-temp syno-temp-" + this._tempColorClass(d.systemTemp);
        tempEl.innerText = `Temp: ${d.systemTemp}°${this.config.tempUnit}`;
        footer.appendChild(tempEl);
      }

      volContainer.appendChild(footer);
      wrapper.appendChild(volContainer);
    }

    // ── VMs ──────────────────────────────────────────────────────────────────
    if (d.vms && d.vms.length > 0) {
      const vmContainer = document.createElement("div");
      vmContainer.className = "syno-vms";

      d.vms.forEach(vm => {
        const row = document.createElement("div");
        row.className = "syno-vm-row";

        const isDown = vm.status !== "running";
        const dot = document.createElement("span");
        dot.className = "syno-dot syno-dot-" + (isDown ? "red" : "green");
        row.appendChild(dot);

        const name = document.createElement("span");
        name.className = "syno-vm-name" + (isDown ? " syno-vm-down" : "");
        name.innerText = vm.name;
        row.appendChild(name);

        if (vm.status === "running") {
          if (vm.cpuPct !== null) {
            const cpu = document.createElement("span");
            cpu.className = "syno-vm-stat dimmed";
            cpu.innerText = `CPU ${vm.cpuPct}%`;
            row.appendChild(cpu);
          }
          if (vm.ramUsedMB !== null && vm.ramTotalMB !== null) {
            const ramPct = vm.ramTotalMB > 0 ? Math.round((vm.ramUsedMB / vm.ramTotalMB) * 100) : 0;
            const ram = document.createElement("span");
            ram.className = "syno-vm-stat dimmed";
            ram.innerText = `RAM ${ramPct}% (${this._fmtMB(vm.ramUsedMB)}/${this._fmtMB(vm.ramTotalMB)})`;
            row.appendChild(ram);
          }
          if (vm.ip) {
            const ip = document.createElement("span");
            ip.className = "syno-vm-ip dimmed";
            ip.innerText = vm.ip;
            row.appendChild(ip);
          }
        } else {
          const status = document.createElement("span");
          status.className = "syno-vm-stat dimmed";
          status.innerText = vm.status;
          row.appendChild(status);
        }

        vmContainer.appendChild(row);
      });

      wrapper.appendChild(vmContainer);
    }

    return wrapper;
  },

  _driveStatusClass(status) {
    switch (status) {
      case "normal":   return "green";
      case "warning":  return "yellow";
      case "critical":
      case "crashed":  return "red";
      default:         return "gray";  // notexist
    }
  },

  _driveStatusText(status) {
    switch (status) {
      case "normal":   return "Normal";
      case "warning":  return "Warning";
      case "critical": return "Critical";
      case "crashed":  return "Failed";
      case "notexist": return "—";
      default:         return status;
    }
  },

  _volColorClass(pct) {
    if (pct >= 85) return "red";
    if (pct >= 70) return "yellow";
    return "green";
  },

  _tempColorClass(temp) {
    // For Fahrenheit thresholds: 50°C→122°F, 60°C→140°F
    const isFahrenheit = this.config.tempUnit === "F";
    const low  = isFahrenheit ? 122 : 50;
    const high = isFahrenheit ? 140 : 60;
    if (temp >= high) return "red";
    if (temp >= low)  return "yellow";
    return "green";
  },

  _fmtMB(mb) {
    if (!mb) return "0";
    if (mb >= 1024) return (mb / 1024).toFixed(1) + "G";
    return mb + "M";
  },

  _fmtBytes(bytes) {
    if (!bytes) return "0 B";
    const tb = bytes / (1024 ** 4);
    if (tb >= 1) return tb.toFixed(1) + " TB";
    const gb = bytes / (1024 ** 3);
    return gb.toFixed(0) + " GB";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "SYNOLOGY_DATA") {
      this.synoData = payload;
      this.lastUpdated = Date.now();
      this.updateDom(300);
    }
    if (notification === "SYNOLOGY_ALERT") {
      // Frontend can act on alerts; for now just force re-render
      this.updateDom(0);
    }
  },

});
