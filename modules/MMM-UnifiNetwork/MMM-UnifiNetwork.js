Module.register("MMM-UnifiNetwork", {

  defaults: {
    host: "",
    apiKey: "",
    username: "",
    password: "",
    site: "default",
    updateInterval: 30 * 1000,
    showWanStatus: true,
    showClientCount: true,
    showDeviceHealth: true,
    showBandwidth: true,
    showPublicIp: false,
    showClientBreakdown: true,
    wanSpeedMbps: 1000,
  },

  getStyles() {
    return ["MMM-UnifiNetwork.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.wan       = null;
    this.clients   = null;
    this.devices   = [];
    this.bandwidth = null;
    this.lastUpdated = null;
    this.sendSocketNotification("INIT", this.config);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-UnifiNetwork";

    if (this.config.showWanStatus)    wrapper.appendChild(this._buildWan());
    if (this.config.showClientCount)  wrapper.appendChild(this._buildClients());
    if (this.config.showBandwidth)    wrapper.appendChild(this._buildBandwidth());
    if (this.config.showDeviceHealth) wrapper.appendChild(this._buildDevices());

    return wrapper;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "WAN_STATUS":    this.wan       = payload; this.lastUpdated = Date.now(); this.updateDom(); break;
      case "CLIENT_COUNT":  this.clients   = payload; this.lastUpdated = Date.now(); this.updateDom(); break;
      case "DEVICE_HEALTH": this.devices   = payload; this.lastUpdated = Date.now(); this.updateDom(); break;
      case "BANDWIDTH":     this.bandwidth = payload; this.lastUpdated = Date.now(); this.updateDom(); break;
    }
  },

  // ── WAN Status ────────────────────────────────────────────────────────────

  _buildWan() {
    if (!this.wan) return this._skeleton("WAN STATUS");

    const w = this.wan;

    if (!w.isOnline) {
      const banner = document.createElement("div");
      banner.className = "un-wan-offline";
      banner.textContent = "⚠ WAN OFFLINE";
      return banner;
    }

    const bar = document.createElement("div");
    bar.className = "un-wan-bar";

    // Online dot
    const dot = document.createElement("span");
    dot.className = "un-wan-dot";
    bar.appendChild(dot);

    // Upload
    const up = document.createElement("span");
    up.className = "un-wan-stat";
    up.innerHTML = `<span class="un-wan-arrow">↑</span>${w.uploadMbps} <span class="un-wan-unit">Mbps</span>`;
    bar.appendChild(up);

    // Download
    const down = document.createElement("span");
    down.className = "un-wan-stat";
    down.innerHTML = `<span class="un-wan-arrow">↓</span>${w.downloadMbps} <span class="un-wan-unit">Mbps</span>`;
    bar.appendChild(down);

    // Latency
    if (w.latency !== null && w.latency !== undefined) {
      const lat = document.createElement("span");
      lat.className = "un-wan-stat";
      lat.innerHTML = `${w.latency} <span class="un-wan-unit">ms</span>`;
      bar.appendChild(lat);
    }

    // Public IP (optional)
    if (this.config.showPublicIp && w.publicIp) {
      const ip = document.createElement("span");
      ip.className = "un-wan-ip";
      ip.textContent = w.publicIp;
      bar.appendChild(ip);
    }

    return bar;
  },

  // ── Client Count ──────────────────────────────────────────────────────────

  _buildClients() {
    const section = this._section("Clients", "◎", "clients");

    if (!this.clients) {
      section.appendChild(this._empty("Loading..."));
      return section;
    }

    const c = this.clients;
    const maxClients = 255;
    const pct = Math.min(100, (c.total / maxClients) * 100);

    const barWrap = document.createElement("div");
    barWrap.className = "un-client-bar-wrap";

    const fill = document.createElement("div");
    fill.className = "un-client-bar-fill";
    fill.style.width = `${Math.max(1, pct)}%`;

    barWrap.appendChild(fill);
    section.appendChild(barWrap);

    const info = document.createElement("div");
    info.className = "un-client-info";

    const total = document.createElement("span");
    total.className = "un-client-total-label";
    total.textContent = `${c.total} clients`;

    const wired = document.createElement("span");
    wired.className = "un-client-wired-label";
    wired.textContent = `${c.wired} wired`;

    info.appendChild(total);
    info.appendChild(wired);
    section.appendChild(info);

    return section;
  },

  // ── Bandwidth ─────────────────────────────────────────────────────────────

  _buildBandwidth() {
    if (!this.bandwidth) return document.createDocumentFragment();

    const b = this.bandwidth;
    const section = this._section("Bandwidth", "▤", "bandwidth");

    // ── Live bar ──
    section.appendChild(this._bwBar(b.utilizationPct, `Now  ↓${b.rxMbps}  ↑${b.txMbps} Mbps`));

    // ── Average bar (only once we have enough samples to be meaningful) ──
    if (b.historyMinutes >= 1) {
      const windowLabel = b.historyMinutes >= 60
        ? `${Math.floor(b.historyMinutes / 60)}h avg`
        : `${b.historyMinutes}m avg`;
      section.appendChild(
        this._bwBar(b.avgUtilizationPct, `${windowLabel}  ↓${b.avgRxMbps}  ↑${b.avgTxMbps} Mbps`, true)
      );
    }

    return section;
  },

  _bwBar(pct, labelText, isAvg = false) {
    const wrap = document.createElement("div");
    wrap.className = "un-bw-row";

    const barWrap = document.createElement("div");
    barWrap.className = `un-bw-bar-wrap${isAvg ? " avg" : ""}`;

    const fill = document.createElement("div");
    fill.className = "un-bw-bar-fill";
    fill.style.width = `${Math.max(1, pct)}%`;
    if (pct > 80)      fill.classList.add("high");
    else if (pct > 50) fill.classList.add("mid");
    if (isAvg)         fill.classList.add("avg");

    barWrap.appendChild(fill);

    const label = document.createElement("div");
    label.className = "un-bw-label";
    label.textContent = labelText;

    wrap.appendChild(barWrap);
    wrap.appendChild(label);
    return wrap;
  },

  // ── Device Health ─────────────────────────────────────────────────────────

  _buildDevices() {
    const offline = this.devices.filter(d => !d.isOnline);
    const online  = this.devices.filter(d =>  d.isOnline);

    // Everything online and nothing to report → hide section
    if (this.devices.length > 0 && offline.length === 0) {
      const section = this._section("Devices", "▣", "devices-ok");
      const ok = document.createElement("div");
      ok.className = "un-devices-all-ok";
      ok.textContent = `All ${this.devices.length} devices online`;
      section.appendChild(ok);
      return section;
    }

    const section = this._section(
      offline.length > 0
        ? `Devices  ${offline.length} offline`
        : "Devices",
      "▣",
      offline.length > 0 ? "devices-warn" : "devices-ok"
    );

    if (this.devices.length === 0) {
      section.appendChild(this._empty("Loading..."));
      return section;
    }

    const grid = document.createElement("div");
    grid.className = "un-device-grid";

    offline.forEach(d => grid.appendChild(this._deviceCard(d)));

    section.appendChild(grid);
    return section;
  },

  _deviceCard(d) {
    const card = document.createElement("div");
    card.className = `un-device-card${d.isOnline ? "" : " offline"}`;

    const left = document.createElement("div");
    left.className = "un-device-left";

    const icon = document.createElement("span");
    icon.className = "un-device-icon";
    icon.textContent = this._deviceIcon(d.type);
    left.appendChild(icon);

    const name = document.createElement("span");
    name.className = "un-device-name";
    name.textContent = d.name;
    left.appendChild(name);

    card.appendChild(left);

    const right = document.createElement("div");
    right.className = "un-device-right";

    // CPU/mem for gateway only
    if (d.cpu !== null && d.cpu !== undefined) {
      const stats = document.createElement("span");
      stats.className = "un-device-stats";
      stats.textContent = `CPU ${Math.round(d.cpu)}%  MEM ${Math.round(d.mem)}%`;
      right.appendChild(stats);
    }

    const dot = document.createElement("span");
    dot.className = `un-device-dot ${d.isOnline ? "online" : "offline"}`;
    right.appendChild(dot);

    card.appendChild(right);
    return card;
  },

  // ── Shared helpers ────────────────────────────────────────────────────────

  _section(title, icon, variant) {
    const section = document.createElement("div");
    section.className = "un-section";

    const h = document.createElement("div");
    h.className = `un-section-heading${variant ? ` un-section-heading--${variant}` : ""}`;

    if (icon) {
      const ico = document.createElement("span");
      ico.className = "un-section-icon";
      ico.textContent = icon;
      h.appendChild(ico);
    }

    const label = document.createElement("span");
    label.textContent = title;
    h.appendChild(label);

    section.appendChild(h);
    return section;
  },

  _skeleton(label) {
    const el = document.createElement("div");
    el.className = "un-skeleton";
    el.textContent = label;
    return el;
  },

  _empty(msg) {
    const el = document.createElement("div");
    el.className = "un-empty";
    el.textContent = msg;
    return el;
  },

  _deviceIcon(type) {
    const icons = { uap: "⌘", usw: "⇄", ugw: "⬡", udm: "⬡", uxg: "⬡" };
    return icons[type] || "▪";
  },

});
