const NodeHelper = require("node_helper");

// Suppress self-signed cert errors for local UniFi controller
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const MAX_EVENTS = 50; // ring buffer ceiling for event history

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-UnifiProtect] helper started");
    this.config = null;
    this.protect = null;
    this.pollTimer = null;
    this.reloginTimer = null;
    this.events = []; // accumulated NEW_EVENT entries
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      // Re-send bootstrap if already connected (browser reconnected); don't re-initialize
      if (this.protect && this.protect.bootstrap) {
        this._sendBootstrap();
        return;
      }
      this._initialize();
    }
  },

  // ── Bootstrap & login ───────────────────────────────────────────────────

  async _initialize() {
    const c = this.config;
    if (!c || !c.host || !c.username || !c.password) {
      console.error("[MMM-UnifiProtect] Missing host/username/password in config");
      return;
    }

    try {
      const { ProtectApi } = await import("unifi-protect");
      this.protect = new ProtectApi();

      const ok = await this.protect.login(c.host, c.username, c.password);
      if (!ok) {
        console.error("[MMM-UnifiProtect] Login failed — check credentials");
        this._scheduleRelogin();
        return;
      }

      const bootstrapOk = await this.protect.getBootstrap();
      if (!bootstrapOk) {
        console.error("[MMM-UnifiProtect] Bootstrap fetch failed");
        this._scheduleRelogin();
        return;
      }

      console.log("[MMM-UnifiProtect] Bootstrap loaded");
      this._sendBootstrap();

      // Live WebSocket events
      this.protect.on("message", (packet) => this._handlePacket(packet));

      // Handle disconnect / reconnect
      this.protect.on("close", () => {
        console.warn("[MMM-UnifiProtect] WebSocket closed — scheduling re-login");
        this._scheduleRelogin();
      });

      // Fallback bootstrap poll every updateInterval (default 60s)
      if (this.pollTimer) clearInterval(this.pollTimer);
      const interval = c.updateInterval || 60000;
      this.pollTimer = setInterval(() => this._refreshBootstrap(), interval);

    } catch (err) {
      console.error("[MMM-UnifiProtect] Initialization error:", err.message);
      this._scheduleRelogin();
    }
  },

  _scheduleRelogin() {
    if (this.reloginTimer) return;
    this.reloginTimer = setTimeout(() => {
      this.reloginTimer = null;
      console.log("[MMM-UnifiProtect] Re-attempting login...");
      this._initialize();
    }, 15000);
  },

  async _refreshBootstrap() {
    if (!this.protect) return;
    try {
      await this.protect.getBootstrap();
      this._sendBootstrap();
    } catch (err) {
      console.error("[MMM-UnifiProtect] Bootstrap refresh error:", err.message);
    }
  },

  _sendBootstrap() {
    const b = this.protect.bootstrap;
    if (!b) return;
    this.sendSocketNotification("SENSORS_DATA", this._mapSensors(b.sensors || []));
    this.sendSocketNotification("CAMERAS_DATA", this._mapCameras(b.cameras || []));
  },

  // ── WebSocket packet handling ────────────────────────────────────────────

  _handlePacket(packet) {
    const { modelKey, action } = packet.header || {};
    const payload = packet.payload || {};

    if (modelKey === "sensor" && action === "update") {
      this._handleSensorUpdate(packet.header.id, payload);
    } else if (modelKey === "camera" && action === "update") {
      this._handleCameraUpdate(packet.header.id, payload);
    } else if (modelKey === "event" && action === "add") {
      this._handleEventAdd(payload);
    }
  },

  _handleSensorUpdate(id, payload) {
    if (!id) return;

    const update = { id };
    if ("isMotionDetected" in payload) update.isMotionDetected = payload.isMotionDetected;
    if ("isOpened"         in payload) update.isOpened         = payload.isOpened;
    if ("lastMotion"       in payload) update.lastMotion       = payload.lastMotion;
    if ("lastSeen"         in payload) update.lastSeen         = payload.lastSeen;
    if ("batteryStatus"    in payload) update.batteryStatus    = payload.batteryStatus;
    if ("temperature"      in payload) update.temperature      = payload.temperature;
    if ("humidity"         in payload) update.humidity         = payload.humidity;

    this.sendSocketNotification("SENSOR_UPDATE", update);
  },

  _handleCameraUpdate(id, payload) {
    if (!id) return;

    const update = { id };
    if ("state"      in payload) update.state      = payload.state;
    if ("lastMotion" in payload) update.lastMotion = payload.lastMotion;

    this.sendSocketNotification("CAMERA_UPDATE", update);
  },

  _handleEventAdd(payload) {
    const type = payload.type;

    // Door / motion sensor events
    if (type === "sensorOpened" || type === "sensorClosed" || type === "sensorMotion") {
      const sensorName = (payload.metadata && payload.metadata.sensorName && payload.metadata.sensorName.text)
                       || this._sensorNameById(payload.device);
      const label = type === "sensorOpened" ? "Door Opened"
                  : type === "sensorClosed" ? "Door Closed"
                  : "Motion Detected";
      this._pushEvent({ sensorName, type: label, timestamp: Date.now() });
      return;
    }

    if (type !== "smartDetectZone") return;
    const types = payload.smartDetectTypes || [];
    if (types.length === 0) return;

    // Filter against config whitelist if provided
    const allowed = (this.config.smartDetectTypes || ["person", "vehicle"]);
    const matched = types.filter(t => allowed.includes(t));
    if (matched.length === 0) return;

    const cam = this._cameraById(payload.camera);
    const cameraName = (payload.metadata && payload.metadata.cameraName && payload.metadata.cameraName.text)
                     || (cam && (cam.name || cam.displayName))
                     || "Unknown camera";
    this.sendSocketNotification("SMART_DETECT", {
      cameraName,
      types: matched,
      timestamp: Date.now(),
    });
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  _pushEvent(entry) {
    this.events.unshift(entry);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    this.sendSocketNotification("NEW_EVENT", entry);
  },

  _sensorNameById(id) {
    const sensors = (this.protect && this.protect.bootstrap && this.protect.bootstrap.sensors) || [];
    const s = sensors.find(x => x.id === id);
    return s ? s.name : id;
  },

  _cameraById(id) {
    const cameras = (this.protect && this.protect.bootstrap && this.protect.bootstrap.cameras) || [];
    return cameras.find(x => x.id === id) || null;
  },

  _mapSensors(sensors) {
    return sensors.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      marketName: s.marketName || "",
      isOpened: s.isOpened,
      isMotionDetected: s.isMotionDetected,
      lastMotion: s.lastMotion,
      lastSeen: s.lastSeen,
      temperature: s.temperature,
      humidity: s.humidity,
      ambientLight: s.ambientLight,
      alarmTriggered: s.alarmTriggered,
      batteryStatus: s.batteryStatus,
    }));
  },

  _mapCameras(cameras) {
    return cameras.map(c => ({
      id: c.id,
      name: c.name || c.displayName,
      state: c.state,
      isAdopted: c.isAdopted !== false, // treat missing as adopted
      lastMotion: c.lastMotion,
      hasSmartDetect: !!(c.featureFlags && c.featureFlags.hasSmartDetect),
      smartDetectTypes: c.smartDetectTypes || [],
    }));
  },

});
