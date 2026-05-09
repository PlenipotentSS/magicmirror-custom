/* MagicMirror² Configuration — EXAMPLE
 * mirror-1 — Pi 1 (Weather, Calendars, Claude Briefing)
 * Copy this file to config.js and fill in your values.
 */

let config = {
  address: "0.0.0.0",
  port: 8080,
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
    // ZONE: TOP LEFT — Weather
    // ─────────────────────────────────────────
    {
      module: "MMM-OpenWeatherMapForecast",
      position: "top_left",
      header: "Local Weather",
      config: {
        apikey: "YOUR_OPENWEATHERMAP_API_KEY",
        latitude: 0.0000,       // your latitude
        longitude: -0.0000,     // your longitude
        units: "imperial",
        colored: true,
        concise: false,
        forecastLayout: "tiled",
        updateInterval: 10,
      }
    },

    // ─────────────────────────────────────────
    // Calendar data source (hidden — feeds CalendarExt3Agenda)
    // ─────────────────────────────────────────
    {
      module: "calendar",
      config: {
        excludedEvents: [
          { filterBy: "Personal Commitment" },
          { filterBy: "reclaim", regex: true },
        ],
        broadcastPastEvents: false,
        fetchInterval: 3600 * 4000,
        calendars: [
          {
            name: "person-1",
            url: "https://calendar.google.com/calendar/ical/PERSON1_EMAIL%40gmail.com/private-PRIVATE_TOKEN/basic.ics",
            calendarName: "person-1",
            fetchInterval: 3600 * 4000,
          },
          {
            name: "person-2",
            url: "https://calendar.google.com/calendar/ical/PERSON2_EMAIL%40gmail.com/private-PRIVATE_TOKEN/basic.ics",
            calendarName: "person-2",
            fetchInterval: 3600 * 4000,
          },
          {
            name: "person-1-work",
            url: "https://calendar.google.com/calendar/ical/WORK_EMAIL%40yourdomain.com/private-PRIVATE_TOKEN/basic.ics",
            calendarName: "person-1-work",
            fetchInterval: 3600 * 4000,
          }
        ],
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP RIGHT — Person 1 Agenda Calendar
    // ─────────────────────────────────────────
    {
      module: "MMM-CalendarExt3Agenda",
      position: "top_right",
      header: "Calendar Upcoming",
      config: {
        startDayIndex: 0,
        endDayIndex: 4,
        waitFetch: 1000 * 25,
        calendarSet: ["person-1", "person-1-work"],
        cellDateOptions: { weekday: "long", month: "short", day: "numeric" },
        eventTimeOptions: { hour: "numeric", minute: "2-digit", hour12: true },
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Dad Joke of the Day
    // ─────────────────────────────────────────
    {
      module: "MMM-DadJoke",
      position: "top_center",
      header: "Dad Joke of the Day",
    },

    // ─────────────────────────────────────────
    // ZONE: TOP CENTER — Person 2 Agenda Calendar
    // ─────────────────────────────────────────
    {
      module: "MMM-CalendarExt3Agenda",
      position: "top_center",
      header: "Calendar Upcoming",
      config: {
        startDayIndex: 0,
        endDayIndex: 4,
        waitFetch: 1000 * 25,
        showMiniMonthCalendar: false,
        calendarSet: ["person-2"],
        cellDateOptions: { weekday: "long", month: "short", day: "numeric" },
        eventTimeOptions: { hour: "numeric", minute: "2-digit", hour12: true },
      }
    },

    // ─────────────────────────────────────────
    // ZONE: TOP LEFT — Claude AI Daily Briefing
    // ─────────────────────────────────────────
    {
      module: "MMM-ClaudeBriefing",
      position: "top_left",
      header: "✦ Today's Briefing",
      config: {
        apiKey: "YOUR_ANTHROPIC_API_KEY",
        updateInterval: 8 * 60 * 60 * 1000,
        model: "claude-sonnet-4-6",
        prompt: `You are a smart home mirror assistant for a household in YOUR_CITY.
                Provide some interesting information for the residents separated by a couple spaces.

                Start the response with a greeting or comment for the day.
                
                Then give each resident 2-3 short action items referencing what to plan for
                in the calendar or insights for their day and something to think about for the next.
                Comment if there is any weather issues in the area, especially if it's a nice day.

                Call out the next 1-2 shared calendar events in plain sentence.

                Use plain sentences only — no markdown, no asterisks,
                no hashes, no bullet symbols, no dashes, no headers.
                Just clean readable text. Keep between 100-120 words total.
                Don't make anything up, and use the calendar or other data when referencing.`,
        maxTokens: 500,
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
        pauseInterval: 63000, // 63 seconds — offset from mirror-2
      }
    },

    // ─────────────────────────────────────────
    // Remote Control (no position — runs as background service)
    // ─────────────────────────────────────────
    {
      module: "MMM-Remote-Control",
      config: {
        // Access at http://YOUR_PI_IP:8080/remote.html
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
        onCommand:  "DISPLAY=:0 xrandr --output HDMI-1 --auto",
        offCommand: "DISPLAY=:0 xrandr --output HDMI-1 --off",
      }
    },

  ] // end modules
};

if (typeof module !== "undefined") { module.exports = config; }
