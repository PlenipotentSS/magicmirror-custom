Module.register("MMM-UnifiProtect", {

  defaults: {
    host: "",
    username: "",
    password: "",
    updateInterval: 60 * 1000,
    showSensorGrid: true,
    showCameraHealth: true,
    showSmartDetect: true,
    showEventFeed: true,
    maxEventEntries: 6,
    maxSmartDetectEntries: 3,
    smartDetectTypes: ["person", "vehicle"],
    excludeSensorTypes: ["glassbreak"],  // sensor types to hide
  },

  getStyles() {
    return ["MMM-UnifiProtect.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.sensors = [];
    this.cameras = [];
    this.eventFeed = [];
    this.smartFeed = [];
    this.lastUpdated = null;
    this.sendSocketNotification("INIT", this.config);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-UnifiProtect";

    if (this.config.showSensorGrid) {
      wrapper.appendChild(this._buildSensorGrid());
    }
    if (this.config.showCameraHealth) {
      wrapper.appendChild(this._buildCameraHealth());
    }
    if (this.config.showEventFeed) {
      wrapper.appendChild(this._buildEventFeed());
    }
    if (this.config.showSmartDetect) {
      wrapper.appendChild(this._buildSmartFeed());
    }

    return wrapper;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "SENSORS_DATA": {
        this.lastUpdated = Date.now();
        const excluded = (this.config.excludeSensorTypes || []).map(e => e.toLowerCase());
        this.sensors = excluded.length
          ? payload.filter(s => {
              const haystack = [s.type, s.marketName, s.name]
                .filter(Boolean).join(" ").toLowerCase();
              return !excluded.some(term => haystack.includes(term));
            })
          : payload;
        this.updateDom();
        break;
      }

      case "CAMERAS_DATA":
        this.cameras = payload;
        this.updateDom();
        break;

      case "SENSOR_UPDATE": {
        const idx = this.sensors.findIndex(s => s.id === payload.id);
        if (idx !== -1) {
          this.sensors[idx] = Object.assign({}, this.sensors[idx], payload);
          this.updateDom();
        }
        // If not in sensors list, it was filtered out — don't add it
        break;
      }

      case "CAMERA_UPDATE": {
        const idx = this.cameras.findIndex(c => c.id === payload.id);
        if (idx !== -1) {
          this.cameras[idx] = Object.assign({}, this.cameras[idx], payload);
        }
        this.updateDom();
        break;
      }

      case "NEW_EVENT":
        this.eventFeed.unshift(payload);
        if (this.eventFeed.length > this.config.maxEventEntries) {
          this.eventFeed.length = this.config.maxEventEntries;
        }
        this.updateDom();
        break;

      case "SMART_DETECT":
        this.smartFeed.unshift(payload);
        if (this.smartFeed.length > this.config.maxSmartDetectEntries) {
          this.smartFeed.length = this.config.maxSmartDetectEntries;
        }
        this.updateDom();
        break;
    }
  },

  // ── DOM builders ──────────────────────────────────────────────────────────

  _buildSensorGrid() {
    const section = this._section("Sensors", "⬡", "sensors");
    const grid = document.createElement("div");
    grid.className = "up-sensor-grid";

    if (this.sensors.length === 0) {
      grid.appendChild(this._empty("No sensors found"));
    } else {
      this.sensors.forEach(s => grid.appendChild(this._sensorCard(s)));
    }

    section.appendChild(grid);
    return section;
  },

  _sensorCard(s) {
    const isOpen   = s.isOpened;
    const isMotion = s.isMotionDetected;

    const card = document.createElement("div");
    card.className = "up-sensor-card";
    if (isOpen)                card.classList.add("door-open");
    else if (isOpen === false) card.classList.add("door-closed");
    if (isMotion)              card.classList.add("motion-active");

    const name = document.createElement("div");
    name.className = "up-sensor-name";
    name.textContent = s.name || s.id;
    card.appendChild(name);

    // Low battery badge
    const pct = s.batteryStatus && s.batteryStatus.percentage;
    if (pct !== undefined && pct < 20) {
      const batt = document.createElement("div");
      batt.className = "up-sensor-batt low";
      batt.textContent = `🔋 ${pct}%`;
      card.appendChild(batt);
    }

    return card;
  },

  _buildCameraHealth() {
    const offline = this.cameras.filter(c => c.isAdopted && c.state !== "CONNECTED");

    // All cameras online (or none loaded yet) — show nothing
    if (this.cameras.length === 0 || offline.length === 0) {
      return document.createDocumentFragment();
    }

    const adopted = this.cameras.filter(c => c.isAdopted);
    const section = this._section(`Cameras Offline  ${offline.length} / ${adopted.length}`, "⚠", "offline");
    const row = document.createElement("div");
    row.className = "up-camera-row";
    offline.forEach(c => row.appendChild(this._cameraChip(c)));
    section.appendChild(row);
    return section;
  },

  _cameraChip(c) {
    const chip = document.createElement("div");
    chip.className = "up-camera-chip offline";

    const dot = document.createElement("span");
    dot.className = "up-camera-dot offline";

    const name = document.createElement("span");
    name.className = "up-camera-name";
    name.textContent = c.name || c.id;

    chip.appendChild(dot);
    chip.appendChild(name);
    return chip;
  },

  _buildEventFeed() {
    if (this.eventFeed.length === 0) return document.createDocumentFragment();

    const section = this._section("Recent Events", "◎", "events");
    const list = document.createElement("div");
    list.className = "up-event-list";
    this.eventFeed.forEach(e => list.appendChild(this._eventRow(e)));
    section.appendChild(list);
    return section;
  },

  _eventRow(e) {
    const row = document.createElement("div");
    row.className = "up-event-row";

    const icon = document.createElement("span");
    icon.className = "up-event-icon";
    icon.textContent = this._eventIcon(e.type);

    const body = document.createElement("span");
    body.className = "up-event-body";

    const sensorSpan = document.createElement("strong");
    sensorSpan.textContent = e.sensorName || "Unknown";

    const typeSpan = document.createElement("span");
    typeSpan.className = "up-event-type";
    typeSpan.textContent = ` — ${e.type}`;

    body.appendChild(sensorSpan);
    body.appendChild(typeSpan);

    const time = document.createElement("span");
    time.className = "up-event-time";
    time.textContent = this._relTime(e.timestamp);

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(time);
    return row;
  },

  _buildSmartFeed() {
    if (this.smartFeed.length === 0) return document.createDocumentFragment();

    const section = this._section("Smart Detect", "◈", "smart");
    const list = document.createElement("div");
    list.className = "up-smart-list";
    this.smartFeed.forEach(e => {
      const row = document.createElement("div");
      row.className = "up-smart-row";

      const label = document.createElement("span");
      label.className = "up-smart-label";
      const typeLabel = e.types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
      label.textContent = `${typeLabel} detected — ${e.cameraName}`;

      const time = document.createElement("span");
      time.className = "up-event-time";
      time.textContent = this._relTime(e.timestamp);

      row.appendChild(label);
      row.appendChild(time);
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  },

  // ── Utilities ─────────────────────────────────────────────────────────────

  _section(title, icon, variant) {
    const section = document.createElement("div");
    section.className = "up-section";
    const h = document.createElement("div");
    h.className = `up-section-heading${variant ? ` up-section-heading--${variant}` : ""}`;
    if (icon) {
      const ico = document.createElement("span");
      ico.className = "up-section-icon";
      ico.textContent = icon;
      h.appendChild(ico);
    }
    const label = document.createElement("span");
    label.textContent = title;
    h.appendChild(label);
    section.appendChild(h);
    return section;
  },

  _empty(msg) {
    const el = document.createElement("div");
    el.className = "up-empty";
    el.textContent = msg;
    return el;
  },

  _eventIcon(type) {
    const icons = {
      "Door Opened":    "▭",
      "Door Closed":    "▬",
      "Motion Detected":"◉",
    };
    return icons[type] || "•";
  },

  _relTime(ts) {
    if (!ts) return "";
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  },

});
