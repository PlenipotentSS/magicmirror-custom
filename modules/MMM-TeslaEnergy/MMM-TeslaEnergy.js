Module.register("MMM-TeslaEnergy", {

  defaults: {
    updateInterval: 5 * 60 * 1000,
    siteId: null,           // auto-discovered if null
    showSolar: true,
    showPowerwall: true,
    showGrid: true,
    showHome: true,
    animateIn: true,
  },

  getHeader() {
    const ts = this.lastUpdated
      ? new Date(this.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    return this.data.header
      + (ts ? `<span class="module-header-updated">${ts}</span>` : "");
  },

  start() {
    this.data2 = null;
    this.error = null;
    this.loaded = false;
    this.lastUpdated = null;
    this.sendSocketNotification("TESLA_ENERGY_START", { config: this.config });
    setInterval(() => {
      this.sendSocketNotification("TESLA_ENERGY_FETCH", {});
    }, this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-TeslaEnergy";

    if (this.error) {
      const err = document.createElement("div");
      err.className = "tesla-error dimmed small";
      err.innerText = this.error;
      wrapper.appendChild(err);
      return wrapper;
    }

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Loading Tesla Energy...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const d = this.data2;

    const grid = document.createElement("div");
    grid.className = "tesla-grid";

    if (this.config.showSolar && d.solar_power !== null) {
      const stale = d.lastUpdated && (Date.now() - d.lastUpdated) > 60 * 60 * 1000;
      const solarSubtitle = d.solar_energy_today != null
        ? this._fmtKwh(d.solar_energy_today) + " today"
        : null;
      const chart = d.solar_month_data ? this._makeMonthChart(d.solar_month_data) : null;
      grid.appendChild(this._makeCell("Solar", this._fmt(d.solar_power, "W"), "solar", solarSubtitle, chart, stale));
    }
    if (this.config.showPowerwall && d.percentage_charged !== null) {
      grid.appendChild(this._makeCell("Powerwall", this._fmt(d.percentage_charged, "%"), this._batteryClass(d.percentage_charged)));
    }
    if (this.config.showGrid && d.grid_power !== null) {
      const gridLabel = d.grid_power >= 0 ? "Grid In" : "Grid Out";
      grid.appendChild(this._makeCell(gridLabel, this._fmt(Math.abs(d.grid_power), "W"), "grid"));
    }
    if (this.config.showHome && d.load_power !== null) {
      grid.appendChild(this._makeCell("Home", this._fmt(d.load_power, "W"), "home"));
    }

    if (grid.children.length === 0) {
      const none = document.createElement("div");
      none.className = "dimmed small";
      none.innerText = `Solar: ${this._fmt(d.solar_power, "W")}  Grid: ${d.grid_status || "Unknown"}`;
      wrapper.appendChild(none);
      return wrapper;
    }

    wrapper.appendChild(grid);
    return wrapper;
  },

  _makeCell(label, value, cssClass, subtitle = null, chart = null, stale = false) {
    const cell = document.createElement("div");
    cell.className = "tesla-cell " + cssClass;
    cell.style.position = "relative";

    if (chart) {
      chart.style.position = "absolute";
      chart.style.bottom = "0";
      chart.style.left = "0";
      chart.style.right = "0";
      chart.style.zIndex = "0";
      cell.appendChild(chart);
    }

    const content = document.createElement("div");
    content.style.position = "relative";
    content.style.zIndex = "1";

    const valueEl = document.createElement("div");
    valueEl.className = "tesla-value bright";
    valueEl.innerText = value;

    const labelEl = document.createElement("div");
    labelEl.className = "tesla-label dimmed xsmall";
    labelEl.innerText = label;

    content.appendChild(valueEl);
    content.appendChild(labelEl);

    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.className = "tesla-subtitle dimmed xsmall";
      subEl.style.color = stale ? "#ff9900" : "";
      subEl.innerText = stale ? subtitle + " ⚠" : subtitle;
      content.appendChild(subEl);
    }

    cell.appendChild(content);
    return cell;
  },

  _makeMonthChart(monthData) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = now.getDate();

    const bars = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      bars.push(monthData[key] || 0);
    }

    const maxWh = Math.max(...bars, 1);
    const chartW = 200;
    const chartH = 80;
    const barW = chartW / daysInMonth;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", chartW);
    svg.setAttribute("height", chartH);
    svg.style.opacity = "0.6";
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    bars.forEach((wh, i) => {
      const barH = (wh / maxWh) * chartH;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", i * barW + 0.5);
      rect.setAttribute("y", chartH - barH);
      rect.setAttribute("width", Math.max(barW - 1, 1));
      rect.setAttribute("height", barH);
      rect.setAttribute("fill", i + 1 === today ? "#f0c040" : "#f0c040aa");
      svg.appendChild(rect);
    });

    return svg;
  },

  _fmtKwh(wh) {
    if (wh === null || wh === undefined) return "--";
    return (wh / 1000).toFixed(1) + " kWh";
  },

  _fmt(value, unit) {
    if (value === null || value === undefined) return "—";
    if (unit === "W") {
      return value >= 1000
        ? (value / 1000).toFixed(1) + " kW"
        : Math.round(value) + " W";
    }
    if (unit === "%") return Math.round(value) + "%";
    return value + unit;
  },

  _batteryClass(pct) {
    if (pct === null || pct === undefined) return "battery-unknown";
    if (pct <= 20) return "battery-low";
    if (pct <= 50) return "battery-medium";
    return "battery-high";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "TESLA_ENERGY_DATA") {
      this.data2 = payload;
      this.loaded = true;
      this.error = null;
      this.lastUpdated = Date.now();
      this.updateDom(300);
    }
    if (notification === "TESLA_ENERGY_ERROR") {
      this.error = payload.message;
      this.updateDom();
    }
  },

});
