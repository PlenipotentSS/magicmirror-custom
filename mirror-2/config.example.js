/* MagicMirror² Configuration — EXAMPLE
 * mirror-2 — Pi 2 (Clock, Tesla Energy, Car Status, Network)
 * Copy this file to config.js and fill in your values.
 */

let config = {
  address: "0.0.0.0",
  port: 8081,
  basePath: "/",
  ipWhitelist: [],
  useHttps: false,
  language: "en",
  locale: "en-US",
  logLevel: ["INFO", "LOG", "WARN", "ERROR"],
  timeFormat: 12,
  units: "imperial",

  modules: [

    // ─────────────────────────────────────────
    // ZONE: TOP LEFT — Digital Clock
    // ─────────────────────────────────────────
    {
      module: "MMM-DigClock",
      position: "top_left",
      config: {
        showDate: true,
        showWeek: false,
        showSeconds: true,
        dateFormat: "dddd, MMMM D",
        timezone: "America/Los_Angeles",
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP LEFT — System Info
    // ─────────────────────────────────────────
    {
      module: "MMM-SysInfo",
      position: "top_left",
      header: "System",
      config: {
        updateInterval: 10000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: BOTTOM LEFT — Rivian Car Status
    // ─────────────────────────────────────────
    {
      module: "MMM-RivianCar",
      position: "bottom_left",
      header: "Rivian R1S",
      config: {
        username: "YOUR_RIVIAN_EMAIL",
        password: "YOUR_RIVIAN_PASSWORD",
        updateInterval: 5 * 60 * 1000,
        showCarImage: true,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: BOTTOM RIGHT — Lucid Car Status
    // ─────────────────────────────────────────
    {
      module: "MMM-LucidCar",
      position: "bottom_right",
      header: "Lucid Air",
      config: {
        username: "YOUR_LUCID_EMAIL",
        password: "YOUR_LUCID_PASSWORD",
        updateInterval: 5 * 60 * 1000,
        showCarImage: true,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: BOTTOM RIGHT — Gif Animation
    // ─────────────────────────────────────────
    {
      module: "MMM-Gif",
      position: "bottom_right",
      config: {
        gifs: ["car.gif", "campervan.gif", "pickup.gif"],
        rotateInterval: 10 * 60 * 1000,
        travelDuration: 20000,
        width: "300px",
        bottomOffset: "-60px",
        pauseInterval: 156000, // 156 seconds — offset from mirror-1
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Air Quality Index
    // ─────────────────────────────────────────
    {
      module: "MMM-AQI",
      position: "top_center",
      header: "Air Quality",
      config: {
        token: "YOUR_AQICN_TOKEN",
        city: "usa/your-state/your-city/your-neighborhood",
        iaqi: true,
        weather: false,
        showLastUpdate: true,
        updateInterval: 30 * 60 * 1000,
        animationSpeed: 1000,
        debug: false,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Flume Water Monitor
    // ─────────────────────────────────────────
    {
      module: "MMM-FlumeWater",
      position: "top_center",
      header: "Water",
      config: {
        updateInterval: 60 * 1000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Tesla Energy (Solar + Powerwall)
    // ─────────────────────────────────────────
    {
      module: "MMM-TeslaEnergy",
      position: "top_center",
      header: "Tesla Energy",
      config: {
        updateInterval: 5 * 60 * 1000,
        showSolar: true,
        showPowerwall: true,
        showGrid: true,
        showHome: true,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Leviton Smart Panel
    // ─────────────────────────────────────────
    {
      module: "MMM-LevitonPanel",
      position: "top_center",
      header: "⚡ Panel — Leviton",
      config: {
        email: "YOUR_LEVITON_EMAIL",
        password: "YOUR_LEVITON_PASSWORD",
        costPerKwh: 0.12,
        updateInterval: 5 * 1000,
        wattThresholdYellow: 3000,
        wattThresholdRed: 6000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Sense Energy Monitor
    // ─────────────────────────────────────────
    {
      module: "MMM-SenseEnergy",
      position: "top_center",
      header: "⚡ Panel — Sense",
      config: {
        email: "YOUR_SENSE_EMAIL",
        password: "YOUR_SENSE_PASSWORD",
        costPerKwh: 0.12,
        updateInterval: 5 * 1000,
        wattThresholdYellow: 2000,
        wattThresholdRed: 4000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP RIGHT — UniFi Network
    // ─────────────────────────────────────────
    {
      module: "MMM-UnifiNetwork",
      position: "top_right",
      header: "Network",
      config: {
        host: "YOUR_UDM_IP",            // e.g. "192.168.1.1"
        apiKey: "",                      // Network → Settings → Integrations → API Key
        username: "YOUR_UNIFI_USERNAME",
        password: "YOUR_UNIFI_PASSWORD",
        site: "default",
        showWanStatus: true,
        showClientCount: true,
        showDeviceHealth: true,
        showBandwidth: true,
        showPublicIp: false,
        showClientBreakdown: true,
        wanSpeedMbps: 1000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP LEFT — UniFi Protect
    // ─────────────────────────────────────────
    {
      module: "MMM-UnifiProtect",
      position: "top_left",
      header: "Protect",
      config: {
        host: "YOUR_UDM_IP",                  // e.g. "192.168.1.1"
        username: "YOUR_UNIFI_USERNAME",
        password: "YOUR_UNIFI_PASSWORD",
        updateInterval: 60 * 1000,
        showSensorGrid: true,
        showCameraHealth: true,
        showEventFeed: true,
        showSmartDetect: true,
        smartDetectTypes: ["person", "vehicle"],
        excludeSensorTypes: ["glassbreak"],
        maxEventEntries: 2,
        maxSmartDetectEntries: 2,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Commute Traffic
    // ─────────────────────────────────────────
    {
      module: "MMM-MyCommute",
      position: "top_center",
      header: "🚗 Commute",
      config: {
        apikey: "YOUR_GOOGLE_MAPS_API_KEY",
        origin: "Your Neighborhood, Your City, ST 00000",
        startTime: "07:00",
        endTime: "17:30",
        hideDays: [0, 6],
        colorCodeTravelTime: true,
        moderateThreshold: 1.1,
        poorThreshold: 1.25,
        nextTransitVehicleDepartureFormat: "[ soonest at] h:mm a",
        destinations: [
          {
            destination: "Destination Address 1",
            label: "Destination 1",
            color: "#4285F4",
            mode: "driving",
          },
          {
            destination: "Destination Address 2",
            label: "Destination 2",
            color: "#FBD000",
            mode: "driving",
          },
        ]
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP RIGHT — Ping / Uptime Status
    // ─────────────────────────────────────────
    {
      module: "MMM-PingStatus",
      position: "top_right",
      header: "Uptime",
      config: {
        hosts: [
          "your-domain.com",
        ],
        updateInterval: 60 * 1000,
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP RIGHT — Synology NAS Health
    // ─────────────────────────────────────────
    {
      module: "MMM-Synology",
      position: "top_right",
      header: "NAS",
      config: {
        host:           "YOUR_NAS_IP",        // e.g. "192.168.1.x"
        port:           5001,
        username:       "YOUR_NAS_USERNAME",
        password:       "YOUR_NAS_PASSWORD",
        useHttps:       true,
        updateInterval: 60 * 1000,
        showDriveModels: false,
        tempUnit:       "F",
      }
    },

    // ─────────────────────────────────────────
    // Remote Control (no position — runs as background service)
    // ─────────────────────────────────────────
    {
      module: "MMM-Remote-Control",
      config: {
        // Access at http://YOUR_PI_IP:8081/remote.html
      }
    },

    // ─────────────────────────────────────────
    // PIR Motion Sensor — Screen on/off
    // ─────────────────────────────────────────
    {
      module: "MMM-Universal-Pir",
      position: "bottom_bar",
      config: {
        gpioCommand: "gpiomon -b gpiochip0 24",
        deactivateDelay: 120 * 1000,
        onCommand:  "DISPLAY=:0 xrandr --output HDMI-2 --auto",
        offCommand: "DISPLAY=:0 xrandr --output HDMI-2 --off",
      }
    },

  ] // end modules
};

if (typeof module !== "undefined") { module.exports = config; }
