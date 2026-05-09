const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const TOKEN_FILE = path.join(__dirname, "token.json");

const GQL_GATEWAY = "https://rivian.com/api/gql/gateway/graphql";

const BASE_HEADERS = {
  "User-Agent": "RivianApp/707 CFNetwork/1237 Darwin/20.4.0",
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Apollographql-Client-Name": "com.rivian.ios.consumer-apollo-ios",
};

// Fields we care about for the display
const STATE_FIELDS = [
  "batteryLevel",
  "distanceToEmpty",
  "chargerState",
  "chargePortState",
  "timeToEndOfCharge",
  "powerState",
  "doorFrontLeftClosed",   "doorFrontLeftLocked",
  "doorFrontRightClosed",  "doorFrontRightLocked",
  "doorRearLeftClosed",    "doorRearLeftLocked",
  "doorRearRightClosed",   "doorRearRightLocked",
  "closureFrunkClosed",
  "closureLiftgateClosed",
  "closureTonneauClosed",
  "windowFrontLeftClosed",
  "windowFrontRightClosed",
  "windowRearLeftClosed",
  "windowRearRightClosed",
  "gearStatus",
  "vehicleMileage",
];

// Each field returns { timeStamp, value } — special fields use different shapes
const VALUE_TMPL     = "{ timeStamp value }";
const GEO_TMPL       = "{ latitude longitude timeStamp }";
const CLOUD_TMPL     = "{ __typename lastSync hasSynced }";
const GNSS_ERR_TMPL  = "{ latitude longitude positionVertical heading speed timeStamp }";

const FIELD_FRAGMENT = STATE_FIELDS
  .map(f => `${f} ${VALUE_TMPL}`)
  .join(" ");

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-RivianCar] helper started");
    this.config = null;
    this.session = null;   // { csrfToken, appSessionToken, userSessionToken, accessToken, refreshToken }
    this.vehicleId = null;
    this._loadSession();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "RIVIAN_START") {
      this.config = payload.config;
      this._run();
    }
    if (notification === "RIVIAN_FETCH") {
      if (this.config) this._run();
    }
    if (notification === "RIVIAN_OTP") {
      // Frontend sends OTP code entered by user
      this._validateOtp(payload.otpCode).catch(e => {
        this.sendSocketNotification("RIVIAN_ERROR", { message: e.message });
      });
    }
  },

  // ── Persistence ───────────────────────────────────────────────────────────

  _loadSession() {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        this.session = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
        this.vehicleId = this.session.vehicleId || null;
        console.log("[MMM-RivianCar] Session loaded from disk");
      }
    } catch (e) {
      console.warn("[MMM-RivianCar] Could not load session:", e.message);
    }
  },

  _saveSession(data) {
    this.session = { ...this.session, ...data };
    if (this.vehicleId) this.session.vehicleId = this.vehicleId;
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.session, null, 2));
    } catch (e) {
      console.warn("[MMM-RivianCar] Could not save session:", e.message);
    }
  },

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  async _gql(body, extraHeaders = {}) {
    const res = await fetch(GQL_GATEWAY, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        "dc-cid": "m-ios-" + uuidv4(),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      const code = json.errors[0]?.extensions?.code || "GQL_ERROR";
      const msg  = json.errors[0]?.message || JSON.stringify(json.errors[0]);
      throw Object.assign(new Error(msg), { code });
    }
    return json.data;
  },

  _authHeaders() {
    return {
      "Csrf-Token": this.session.csrfToken,
      "A-Sess":     this.session.appSessionToken,
      "U-Sess":     this.session.userSessionToken,
    };
  },

  // ── Auth flow ─────────────────────────────────────────────────────────────

  async _ensureSession() {
    // Already have a valid user session
    if (this.session?.userSessionToken && this.session?.accessToken) return;
    await this._login();
  },

  async _login() {
    console.log("[MMM-RivianCar] Creating CSRF token...");
    const csrfData = await this._gql({
      operationName: "CreateCSRFToken",
      query: "mutation CreateCSRFToken { createCsrfToken { __typename csrfToken appSessionToken } }",
    });
    this._saveSession({
      csrfToken:       csrfData.createCsrfToken.csrfToken,
      appSessionToken: csrfData.createCsrfToken.appSessionToken,
    });

    console.log("[MMM-RivianCar] Logging in as", this.config.username);
    const loginData = await this._gql(
      {
        operationName: "Login",
        query: `mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    __typename
    ... on MobileLoginResponse {
      __typename accessToken refreshToken userSessionToken
    }
    ... on MobileMFALoginResponse {
      __typename otpToken
    }
  }
}`,
        variables: { email: this.config.username, password: this.config.password },
      },
      {
        "Csrf-Token": this.session.csrfToken,
        "A-Sess":     this.session.appSessionToken,
      }
    );

    const login = loginData.login;
    if (login.__typename === "MobileMFALoginResponse") {
      // Need OTP — save otpToken and prompt user
      this._saveSession({ otpToken: login.otpToken });
      console.log("[MMM-RivianCar] MFA required — waiting for OTP");
      this.sendSocketNotification("RIVIAN_NEED_OTP", {});
      return;
    }

    // Direct login success
    this._saveSession({
      accessToken:      login.accessToken,
      refreshToken:     login.refreshToken,
      userSessionToken: login.userSessionToken,
      otpToken:         null,
    });
    console.log("[MMM-RivianCar] Logged in successfully");
  },

  async _validateOtp(otpCode) {
    console.log("[MMM-RivianCar] Validating OTP...");
    const data = await this._gql(
      {
        operationName: "LoginWithOTP",
        query: `mutation LoginWithOTP($email: String!, $otpCode: String!, $otpToken: String!) {
  loginWithOTP(email: $email, otpCode: $otpCode, otpToken: $otpToken) {
    __typename
    ... on MobileLoginResponse {
      __typename accessToken refreshToken userSessionToken
    }
  }
}`,
        variables: {
          email:    this.config.username,
          otpCode,
          otpToken: this.session.otpToken,
        },
      },
      {
        "Csrf-Token": this.session.csrfToken,
        "A-Sess":     this.session.appSessionToken,
      }
    );
    const login = data.loginWithOTP;
    this._saveSession({
      accessToken:      login.accessToken,
      refreshToken:     login.refreshToken,
      userSessionToken: login.userSessionToken,
      otpToken:         null,
    });
    console.log("[MMM-RivianCar] OTP validated, logged in");
    this._run();
  },

  // ── Vehicle discovery ─────────────────────────────────────────────────────

  async _discoverVehicle() {
    if (this.vehicleId) return;
    console.log("[MMM-RivianCar] Discovering vehicle...");
    const data = await this._gql(
      {
        operationName: "getUserInfo",
        query: `query getUserInfo {
  currentUser {
    __typename id
    vehicles {
      id vin name
      vehicle { __typename id vin make model modelYear }
    }
  }
}`,
      },
      this._authHeaders()
    );
    const vehicles = data?.currentUser?.vehicles || [];
    if (vehicles.length === 0) throw new Error("No Rivian vehicles on account");
    this.vehicleId = vehicles[0].id;
    this._saveSession({ vehicleId: this.vehicleId });
    console.log("[MMM-RivianCar] Vehicle ID:", this.vehicleId);
  },

  // ── State fetch ───────────────────────────────────────────────────────────

  async _fetchState() {
    const data = await this._gql(
      {
        operationName: "GetVehicleState",
        query: `query GetVehicleState($vehicleID: String!) {
  vehicleState(id: $vehicleID) { ${FIELD_FRAGMENT} }
}`,
        variables: { vehicleID: this.vehicleId },
      },
      this._authHeaders()
    );

    const s = data.vehicleState;
    if (!s) throw new Error("Empty vehicleState in response");

    const v = field => s[field]?.value ?? null;

    const allLocked =
      v("doorFrontLeftLocked") === "locked" &&
      v("doorFrontRightLocked") === "locked" &&
      v("doorRearLeftLocked") === "locked" &&
      v("doorRearRightLocked") === "locked";

    const openDoors = [];
    const doorMap = {
      "FL door": "doorFrontLeftClosed",
      "FR door": "doorFrontRightClosed",
      "RL door": "doorRearLeftClosed",
      "RR door": "doorRearRightClosed",
      "Frunk":   "closureFrunkClosed",
      "Liftgate":"closureLiftgateClosed",
      "Tonneau": "closureTonneauClosed",
    };
    for (const [label, field] of Object.entries(doorMap)) {
      const val = v(field);
      if (val === "open" || val === false || val === "false") openDoors.push(label);
    }

    const openWindows = ["windowFrontLeftClosed","windowFrontRightClosed",
                         "windowRearLeftClosed","windowRearRightClosed"]
      .filter(f => v(f) === "open" || v(f) === false || v(f) === "false");

    const chargerState = (v("chargerState") || "").toLowerCase();

    const payload = {
      chargePercent:    v("batteryLevel"),
      remainingRange:   v("distanceToEmpty"),
      locked:           allLocked ? "locked" : "unlocked",
      chargeState:      chargerState,
      chargePortOpen:   v("chargePortState") !== "closed",
      timeToEndCharge:  v("timeToEndOfCharge"),
      powerState:       (v("powerState") || "").toLowerCase(),
      openDoors,
      windowsOpen:      openWindows.length > 0,
      gearStatus:       (v("gearStatus") || "").toLowerCase(),
      lastUpdated:      Date.now(),
    };

    this.sendSocketNotification("RIVIAN_DATA", payload);
  },

  // ── Main run ──────────────────────────────────────────────────────────────

  async _run() {
    try {
      await this._ensureSession();
      // If we ended up waiting for OTP, stop here
      if (!this.session?.userSessionToken) return;
      await this._discoverVehicle();
      await this._fetchState();
    } catch (e) {
      // If auth failed, clear session so next run re-authenticates
      if (e.code === "UNAUTHENTICATED" || e.code === "UNAUTHORIZED") {
        console.warn("[MMM-RivianCar] Session expired — clearing, will re-auth next cycle");
        this.session = null;
        this.vehicleId = null;
        try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
      }
      console.error("[MMM-RivianCar] Run error:", e.message);
      this.sendSocketNotification("RIVIAN_ERROR", { message: e.message });
    }
  },

});
