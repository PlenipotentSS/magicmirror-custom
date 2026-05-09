Module.register("MMM-LevitonPanel", {

  defaults: {
    email: "",
    password: "",
    costPerKwh: 0.12,
    updateInterval: 15 * 1000,
    wattThresholdYellow: 3000,
    wattThresholdRed: 6000,
  },

  getStyles() {
    return ["MMM-LevitonPanel.css"];
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.totalWatts = null;
    this.circuits = [];
    this.daily = null;
    this.kwhHistory = {};
    this.trippedCircuits = [];
    this.loaded = false;
    this.error = null;
    this.lastUpdated = null;
    this.sendSocketNotification("INIT", this.config);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-LevitonPanel panel-card";
    wrapper.style.position = "relative";

    if (this.error) {
      wrapper.innerHTML = '<div class="panel-status panel-error">' + this.error + "</div>";
      return wrapper;
    }

    if (!this.loaded) {
      wrapper.innerHTML = '<div class="panel-status panel-loading">Connecting to Leviton…</div>';
      return wrapper;
    }

    // ── Background bar chart ──────────────────────────────────────────────────
    const chart = this._makeHistoryChart(this.kwhHistory);
    if (chart) wrapper.appendChild(chart);

    // ── Icon + data row ───────────────────────────────────────────────────────
    const row = document.createElement("div");
    row.className = "panel-row";
    row.style.position = "relative";
    row.style.zIndex = "1";

    row.appendChild(this._makePanelIcon());

    const dataCol = document.createElement("div");
    dataCol.className = "panel-data-col";

    const wattsEl = document.createElement("div");
    wattsEl.className = "panel-watts " + this._wattClass(this.totalWatts);
    wattsEl.innerText = this._fmtWatts(this.totalWatts);
    dataCol.appendChild(wattsEl);

    // Top breaker
    const top = this.circuits
      .filter(c => (c.watts ?? 0) > 0 && c.state !== "TRIPPED")
      .sort((a, b) => (b.watts ?? 0) - (a.watts ?? 0))[0];
    if (top) {
      const topEl = document.createElement("div");
      topEl.className = "panel-top-consumer";
      topEl.innerText = top.name + "  " + Math.round(top.watts) + "W";
      dataCol.appendChild(topEl);
    }

    const kwhEl = document.createElement("div");
    kwhEl.className = "panel-kwh";
    kwhEl.innerText = this.daily ? (this._fmtKwh(this.daily.kwhToday) + " today") : "— kWh today";
    dataCol.appendChild(kwhEl);

    // ── Tripped indicators ────────────────────────────────────────────────────
    if (this.trippedCircuits.length > 0) {
      const tripWrap = document.createElement("div");
      tripWrap.className = "panel-trip-wrap";
      this.trippedCircuits.forEach(name => {
        const box = document.createElement("div");
        box.className = "panel-trip-box";
        box.innerText = "⚠ " + name;
        tripWrap.appendChild(box);
      });
      dataCol.appendChild(tripWrap);
    }

    row.appendChild(dataCol);
    wrapper.appendChild(row);

    return wrapper;
  },

  _makePanelIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "panel-icon");
    svg.setAttribute("viewBox", "0 0 44 68");
    svg.setAttribute("width", "44");
    svg.setAttribute("height", "68");

    // Panel body
    const body = document.createElementNS(ns, "rect");
    body.setAttribute("x", "1"); body.setAttribute("y", "1");
    body.setAttribute("width", "42"); body.setAttribute("height", "66");
    body.setAttribute("rx", "3");
    body.setAttribute("class", "pi-body");
    svg.appendChild(body);

    // Top bar (main breaker area)
    const top = document.createElementNS(ns, "rect");
    top.setAttribute("x", "5"); top.setAttribute("y", "5");
    top.setAttribute("width", "34"); top.setAttribute("height", "10");
    top.setAttribute("rx", "2");
    top.setAttribute("class", "pi-main-bar");
    svg.appendChild(top);

    // Main breaker slot
    const mb = document.createElementNS(ns, "rect");
    mb.setAttribute("x", "14"); mb.setAttribute("y", "7");
    mb.setAttribute("width", "16"); mb.setAttribute("height", "6");
    mb.setAttribute("rx", "1");
    mb.setAttribute("class", "pi-main-breaker");
    svg.appendChild(mb);

    // Two columns of breaker slots (6 rows)
    // Color any tripped ones red
    const trippedNames = new Set(this.trippedCircuits);
    const colX = [7, 25];
    const rowY = [19, 27, 35, 43, 51, 59];
    let slotIdx = 0;
    colX.forEach(cx => {
      rowY.forEach(ry => {
        const slot = document.createElementNS(ns, "rect");
        slot.setAttribute("x", String(cx));
        slot.setAttribute("y", String(ry));
        slot.setAttribute("width", "12");
        slot.setAttribute("height", "5");
        slot.setAttribute("rx", "1");
        // Light up slot if corresponding circuit has watts or is tripped
        const circuit = this.circuits[slotIdx];
        const isTripped = circuit && trippedNames.has(circuit.name);
        const isActive = circuit && (circuit.watts ?? 0) > 0;
        slot.setAttribute("class",
          "pi-breaker" +
          (isTripped ? " pi-breaker-tripped" : "") +
          (isActive && !isTripped ? " pi-breaker-on" : "")
        );
        svg.appendChild(slot);
        slotIdx++;
      });
    });

    const wrap = document.createElement("div");
    wrap.className = "panel-icon-wrap";
    wrap.appendChild(svg);
    return wrap;
  },

  _makeHistoryChart(history) {
    const entries = Object.entries(history || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
    if (entries.length < 2) return null;

    const today = new Date().toISOString().slice(0, 10);
    const values = entries.map(([, v]) => v);
    const maxKwh = Math.max(...values, 0.1);
    const chartW = 200;
    const chartH = 40;
    const barW = chartW / 30;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", chartW);
    svg.setAttribute("height", chartH);
    svg.style.position = "absolute";
    svg.style.bottom = "0";
    svg.style.left = "58px";
    svg.style.zIndex = "0";
    svg.style.opacity = "0.5";

    entries.forEach(([day, kwh]) => {
      const d = parseInt(day.slice(8), 10) - 1; // 0-indexed day of month
      const barH = (kwh / maxKwh) * chartH;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", d * barW + 0.5);
      rect.setAttribute("y", chartH - barH);
      rect.setAttribute("width", Math.max(barW - 1, 1));
      rect.setAttribute("height", barH);
      rect.setAttribute("fill", day === today ? "#aaaaaa" : "#666666");
      svg.appendChild(rect);
    });

    return svg;
  },

  _wattClass(w) {
    if (w === null) return "";
    if (w >= this.config.wattThresholdRed) return "watts-red";
    if (w >= this.config.wattThresholdYellow) return "watts-yellow";
    return "watts-green";
  },

  _fmtWatts(w) {
    if (w === null || w === undefined) return "—";
    if (w >= 1000) return (w / 1000).toFixed(1) + " kW";
    return Math.round(w) + " W";
  },

  _fmtKwh(kwh) {
    const n = parseFloat(kwh);
    if (isNaN(n)) return "—";
    return n.toFixed(1) + " kWh";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "LEVITON_CIRCUITS") {
      this.totalWatts = payload.totalWatts ?? null;
      this.circuits = payload.circuits || [];
      this.loaded = true;
      this.error = null;
      this.lastUpdated = Date.now();
      this.updateDom(0);
    }
    if (notification === "LEVITON_DAILY") {
      this.daily = payload;
      this.kwhHistory = payload.kwhHistory || {};
      this.updateDom(0);
    }
    if (notification === "LEVITON_TRIP") {
      const name = payload.circuitName;
      if (name && !this.trippedCircuits.includes(name)) {
        this.trippedCircuits.push(name);
      }
      this.updateDom(0);
    }
    if (notification === "LEVITON_CLEAR") {
      this.trippedCircuits = this.trippedCircuits.filter(n => n !== payload.circuitName);
      this.updateDom(0);
    }
    if (notification === "LEVITON_ERROR") {
      this.error = payload.message;
      this.updateDom();
    }
  },

});
