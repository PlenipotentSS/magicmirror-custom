const NodeHelper = require("node_helper");
const path = require("path");
const fs = require("fs");

const PROTO_DIR = path.join(__dirname, "proto");
const TOKEN_FILE = path.join(__dirname, "token.json");
const API_HOST = "mobile.deneb.prod.infotainment.pdx.atieva.com:443";

const LOCK_STATE    = { 0: "unknown", 1: "unlocked", 2: "locked" };
const DOOR_STATE    = { 0: "unknown", 1: "open", 2: "closed", 3: "ajar", 4: "error" };
const CHARGE_STATE  = {
  0: "unknown", 1: "not_connected", 2: "connected", 3: "establishing",
  8: "charging", 9: "complete", 10: "error", 13: "stopped",
  14: "paused", 30: "scheduled",
};
const POWER_STATE   = {
  0: "unknown", 1: "sleep", 2: "wink", 3: "accessory", 4: "drive",
  5: "charging", 6: "sleep_charge", 7: "updating",
};
const ALL_WINDOW_POS = { 0: "unknown", 1: "idle", 2: "open", 3: "closed", 4: "error" };

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-LucidCar] helper started");
    this.config = null;
    this.grpcReady = false;
    this.loginStub = null;
    this.token = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    this.vehicleId = null;
    this._loadToken();
    this._initGrpc();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "LUCID_START") {
      this.config = payload.config;
      if (this.grpcReady) this._run();
    }
    if (notification === "LUCID_FETCH") {
      if (this.grpcReady && this.config) this._run();
    }
  },

  _initGrpc() {
    try {
      const grpc = require("@grpc/grpc-js");
      const protoLoader = require("@grpc/proto-loader");
      const googleProtoFiles = require("google-proto-files");

      const googleRoot = path.dirname(googleProtoFiles.getProtoPath());
      const pkgDef = protoLoader.loadSync(
        path.join(PROTO_DIR, "login_session.proto"),
        {
          keepCase: true,
          longs: String,
          enums: Number,
          defaults: true,
          oneofs: true,
          includeDirs: [PROTO_DIR, googleRoot],
        }
      );

      const proto = grpc.loadPackageDefinition(pkgDef).mobilegateway.protos;
      const sslCreds = grpc.credentials.createSsl();

      this.loginStub = new proto.LoginSession(API_HOST, sslCreds);
      this.grpcReady = true;
      console.log("[MMM-LucidCar] gRPC stubs ready");

      if (this.config) this._run();
    } catch (e) {
      console.error("[MMM-LucidCar] gRPC init failed:", e.message);
      this.sendSocketNotification("LUCID_ERROR", { message: "gRPC init failed: " + e.message });
    }
  },

  // ── Token management ──────────────────────────────────────────────────────

  _loadToken() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const t = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
        this.token = t.id_token;
        this.refreshToken = t.refresh_token;
        this.tokenExpiry = t.expiry_at || 0;
        this.vehicleId = t.vehicle_id || null;
        console.log("[MMM-LucidCar] Token loaded, vehicle:", this.vehicleId || "unknown");
      }
    } catch (e) {
      console.warn("[MMM-LucidCar] No token on disk:", e.message);
    }
  },

  _saveToken(idToken, refreshToken, expirySec) {
    this.token = idToken;
    this.refreshToken = refreshToken || this.refreshToken;
    // expiry_time_sec from Lucid is an absolute Unix epoch timestamp in seconds, not a duration
    const expiryMs = expirySec > 1e9
      ? expirySec * 1000               // absolute epoch → ms
      : Date.now() + expirySec * 1000; // relative duration (fallback)
    this.tokenExpiry = expiryMs;
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        id_token: idToken,
        refresh_token: this.refreshToken,
        expiry_at: this.tokenExpiry,
        vehicle_id: this.vehicleId || null,
      }, null, 2));
    } catch (e) {
      console.warn("[MMM-LucidCar] Could not save token:", e.message);
    }
  },

  _isTokenExpired() {
    return !this.token || Date.now() > this.tokenExpiry - 60 * 1000;
  },

  _authMeta() {
    const grpc = require("@grpc/grpc-js");
    const meta = new grpc.Metadata();
    meta.add("authorization", "Bearer " + this.token);
    return meta;
  },

  _deadline(seconds = 15) {
    return new Date(Date.now() + seconds * 1000);
  },

  // ── Main flow ─────────────────────────────────────────────────────────────

  async _run() {
    try {
      await this._ensureAuth();
      await this._fetchState();
    } catch (e) {
      console.error("[MMM-LucidCar] Run error:", e.message);
      this.sendSocketNotification("LUCID_ERROR", { message: e.message });
    }
  },

  async _ensureAuth() {
    if (!this._isTokenExpired()) return;

    if (this.refreshToken) {
      try {
        await this._doRefreshToken();
        return;
      } catch (e) {
        console.warn("[MMM-LucidCar] Token refresh failed, logging in fresh:", e.message);
      }
    }
    await this._login();
  },

  _login() {
    return new Promise((resolve, reject) => {
      const { username, password } = this.config;
      const req = {
        username,
        password,
        notification_channel_type: 1,
        os: 1,
        notification_device_token: "mmm-lucidcar-" + Math.random().toString(36).slice(2),
        locale: "en_US",
        client_name: "mmm-lucidcar/1.0",
      };
      console.log("[MMM-LucidCar] Logging in as", username);
      this.loginStub.Login(req, { deadline: this._deadline(20) }, (err, res) => {
        if (err) return reject(new Error("Login failed: " + err.message));
        const sess = res.session_info;
        if (!sess || !sess.id_token) return reject(new Error("Login returned no session"));

        // Grab vehicle ID from login response before saving token (so it's persisted together)
        if (res.user_vehicle_data && res.user_vehicle_data.length > 0) {
          this.vehicleId = res.user_vehicle_data[0].vehicle_id;
          console.log("[MMM-LucidCar] Vehicle ID:", this.vehicleId);
        }

        this._saveToken(sess.id_token, sess.refresh_token, sess.expiry_time_sec || 28800);
        console.log("[MMM-LucidCar] Logged in successfully");
        resolve();
      });
    });
  },

  _doRefreshToken() {
    return new Promise((resolve, reject) => {
      this.loginStub.GetNewJWTToken({ refresh_token: this.refreshToken }, { deadline: this._deadline(20) }, (err, res) => {
        if (err) return reject(new Error("Token refresh RPC failed: " + err.message));
        const sess = res.session_info;
        if (!sess || !sess.id_token) return reject(new Error("Empty session in refresh response"));
        this._saveToken(sess.id_token, sess.refresh_token, sess.expiry_time_sec || 28800);
        console.log("[MMM-LucidCar] Token refreshed");
        resolve();
      });
    });
  },

  // ── State fetch ───────────────────────────────────────────────────────────

  _fetchState() {
    return new Promise((resolve) => {
      this.loginStub.GetUserVehicles(
        {},
        this._authMeta(),
        { deadline: this._deadline(20) },
        (err, res) => {
          if (err) {
            console.error("[MMM-LucidCar] GetUserVehicles error:", err.message);
            this.sendSocketNotification("LUCID_ERROR", { message: "Fetch failed: " + err.message });
            return resolve();
          }

          const vehicles = res.user_vehicle_data || [];
          const vehicle = this.vehicleId
            ? vehicles.find(v => v.vehicle_id === this.vehicleId) || vehicles[0]
            : vehicles[0];

          if (!vehicle) {
            this.sendSocketNotification("LUCID_ERROR", { message: "No vehicles in response" });
            return resolve();
          }

          if (!this.vehicleId) {
            this.vehicleId = vehicle.vehicle_id;
            this._saveToken(this.token, this.refreshToken, Math.round((this.tokenExpiry - Date.now()) / 1000));
          }

          const state    = vehicle.state    || {};
          const battery  = state.battery    || {};
          const body     = state.body       || {};
          const charging = state.charging   || {};

          // Per-window fields: 1=fully_closed, 0=unknown — anything else is open
          const winPos = body.window_position || {};
          const windowsOpen = [winPos.left_front, winPos.left_rear, winPos.right_front, winPos.right_rear]
            .some(w => w !== undefined && w !== 0 && w !== 1);

          const payload = {
            chargePercent:   battery.charge_percent    ?? null,
            remainingRange:  battery.remaining_range   ?? null,
            locked:          LOCK_STATE[body.door_locks]               ?? "unknown",
            windowsOpen,
            doors: {
              frontLeft:  DOOR_STATE[body.front_left_door]  ?? "unknown",
              frontRight: DOOR_STATE[body.front_right_door] ?? "unknown",
              rearLeft:   DOOR_STATE[body.rear_left_door]   ?? "unknown",
              rearRight:  DOOR_STATE[body.rear_right_door]  ?? "unknown",
              frunk:      DOOR_STATE[body.front_cargo]      ?? "unknown",
              trunk:      DOOR_STATE[body.rear_cargo]       ?? "unknown",
              chargePort: DOOR_STATE[body.charge_port]      ?? "unknown",
            },
            chargeState:  CHARGE_STATE[charging.charge_state]  ?? "unknown",
            chargeRateKw: charging.charge_rate_kwh_precise      ?? null,
            chargeLimit:  charging.charge_limit_percent         ?? null,
            powerState:   POWER_STATE[state.power]              ?? "unknown",
            lastUpdated:  state.last_updated_ms ? Number(state.last_updated_ms) : Date.now(),
          };

          console.log("[MMM-LucidCar] State fetched:", payload.chargePercent + "%, " + payload.powerState);
          this.sendSocketNotification("LUCID_DATA", payload);
          resolve();
        }
      );
    });
  },

});
