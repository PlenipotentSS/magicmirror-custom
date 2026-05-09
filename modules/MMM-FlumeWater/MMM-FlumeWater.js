Module.register("MMM-FlumeWater", {

  defaults: {
    updateInterval: 60 * 1000,
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
    this.sendSocketNotification("FLUME_WATER_START", { config: this.config });
    setInterval(() => {
      this.sendSocketNotification("FLUME_WATER_FETCH", {});
    }, this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-FlumeWater";

    if (this.error) {
      const err = document.createElement("div");
      err.className = "flume-error dimmed small";
      err.innerText = this.error;
      wrapper.appendChild(err);
      return wrapper;
    }

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "dimmed small";
      loading.innerText = "Loading Flume Water...";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const d = this.data2;
    const subtitle = d.today_gallons != null ? this._fmtGal(d.today_gallons) + " today" : null;
    const chart = d.month_data ? this._makeMonthChart(d.month_data) : null;

    const grid = document.createElement("div");
    grid.className = "flume-grid";
    grid.appendChild(this._makeCell("Water", this._fmtGpm(d.flow_rate), "flow", subtitle, chart));
    wrapper.appendChild(grid);

    return wrapper;
  },

  _makeCell(label, value, cssClass, subtitle = null, chart = null) {
    const cell = document.createElement("div");
    cell.className = "flume-cell " + cssClass;
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
    valueEl.className = "flume-value bright";
    valueEl.innerText = value;

    const labelEl = document.createElement("div");
    labelEl.className = "flume-label dimmed xsmall";
    labelEl.innerText = label;

    content.appendChild(valueEl);
    content.appendChild(labelEl);

    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.className = "flume-subtitle xsmall";
      subEl.style.color = "#44aaff";
      subEl.innerText = subtitle;
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

    const maxGal = Math.max(...bars, 1);
    const chartW = 200;
    const chartH = 80;
    const barW = chartW / daysInMonth;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", chartW);
    svg.setAttribute("height", chartH);
    svg.style.opacity = "0.6";
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    bars.forEach((gal, i) => {
      const barH = (gal / maxGal) * chartH;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", i * barW + 0.5);
      rect.setAttribute("y", chartH - barH);
      rect.setAttribute("width", Math.max(barW - 1, 1));
      rect.setAttribute("height", barH);
      rect.setAttribute("fill", i + 1 === today ? "#44aaff" : "#44aaffaa");
      svg.appendChild(rect);
    });

    return svg;
  },

  _fmtGpm(gpm) {
    if (gpm === null || gpm === undefined) return "—";
    if (gpm === 0) return "0 gpm";
    return gpm.toFixed(1) + " gpm";
  },

  _fmtGal(gal) {
    if (gal === null || gal === undefined) return "—";
    return Math.round(gal) + " gal";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FLUME_WATER_DATA") {
      this.data2 = payload;
      this.loaded = true;
      this.error = null;
      this.lastUpdated = Date.now();
      this.updateDom(300);
    }
    if (notification === "FLUME_WATER_ERROR") {
      this.error = payload.message;
      this.updateDom();
    }
  },

});
