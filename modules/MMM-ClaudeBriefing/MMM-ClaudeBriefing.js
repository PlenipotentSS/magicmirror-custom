/* MMM-ClaudeBriefing
 * A custom MagicMirror² module that calls the Anthropic API
 * to generate a personalized daily briefing, aware of today's calendar events.
 */

Module.register("MMM-ClaudeBriefing", {

  defaults: {
    apiKey: "",
    updateInterval: 8 * 60 * 60 * 1000,
    model: "claude-haiku-4-5-20251001",
    prompt: "Give me 2-3 short action items for my day.",
    maxTokens: 150,
    animateIn: true,
  },

  start() {
    this.briefingText = "Loading today's briefing...";
    this.loaded = false;
    this.calendarReady = false;
    this.calendarEvents = [];
    this.weatherData = null;
    setInterval(() => this.fetchBriefing(), this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-ClaudeBriefing";

    const text = document.createElement("div");
    text.className = "briefing-text";
    text.innerText = this.briefingText;
    wrapper.appendChild(text);

    return wrapper;
  },

  notificationReceived(notification, payload) {
    if (!["MODULE_DOM_CREATED", "DOM_OBJECTS_CREATED"].includes(notification)) {
      console.log("[MMM-ClaudeBriefing] notification:", notification, Array.isArray(payload) ? `(${payload.length} items)` : typeof payload);
    }
    if (notification === "OPENWEATHER_ONE_CALL_FORECAST_WEATHER_UPDATE") {
      console.log("[MMM-ClaudeBriefing] Weather update received:", JSON.stringify(payload).slice(0, 200));
      this.weatherData = payload;
    }
    if (notification === "CALENDAR_EVENTS") {
      console.log("[MMM-ClaudeBriefing] CALENDAR_EVENTS received, count:", (payload || []).length);
      if (payload && payload.length > 0) {
        console.log("[MMM-ClaudeBriefing] First event sample:", JSON.stringify(payload[0]));
        console.log("[MMM-ClaudeBriefing] All event titles:", (payload || []).map(e => e.title));
      }
      const now = Date.now();
      const endOfWindow = now + 96 * 60 * 60 * 1000;

      // Replace all events each time — CALENDAR_EVENTS sends full merged list per calendar
      // Use calendarName+title+startDate as key to keep each calendar's events distinct
      const isReclaim = e => {
        const title = (e.title || "").toLowerCase();
        const desc = (e.description || "").toLowerCase();
        return title.includes("personal commitment") || title.includes("reclaim") || desc.includes("reclaim");
      };

      const calendarName = (payload && payload.length > 0) ? payload[0].calendarName : null;

      const incoming = (payload || []).filter(e => {
        const start = Number(e.startDate);
        return start >= now - 60 * 60 * 1000 && start <= endOfWindow && !isReclaim(e);
      });

      console.log("[MMM-ClaudeBriefing] Calendar:", calendarName, "raw:", (payload||[]).length, "after filter:", incoming.length);

      // Remove existing events from this calendar, then re-add from fresh payload
      if (calendarName) {
        this.calendarEvents = this.calendarEvents.filter(e => e.calendarName !== calendarName);
      }
      this.calendarEvents.push(...incoming);

      console.log("[MMM-ClaudeBriefing] Total events:", this.calendarEvents.length, this.calendarEvents.map(e => `${e.calendarName}:${e.title}`));

      if (!this.calendarReady) {
        this.calendarReady = true;
        // Wait 3s for second calendar to fire before fetching
        setTimeout(() => this.fetchBriefing(), 3000);
      }
    }
  },

  fetchBriefing() {
    console.log("[MMM-ClaudeBriefing] fetchBriefing called, events:", this.calendarEvents.length);
    const calendarOwner = name => {
      if (!name) return "unknown";
      const n = name.toLowerCase();
      if (n.includes("leah")) return "Leah";
      if (n === "steven-work") return "steven-work";
      if (n.includes("steven")) return "Steven";
      return name;
    };

    const formatEvent = e => {
      const time = e.fullDayEvent ? "all day" : new Date(Number(e.startDate)).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true
      });
      return `- [${calendarOwner(e.calendarName)}] ${e.title} at ${time}`;
    };

    const dayNames = ["Today", "Tomorrow"];
    const grouped = {};
    this.calendarEvents.forEach(e => {
      const start = new Date(Number(e.startDate));
      const diffDays = Math.floor((start - new Date().setHours(0,0,0,0)) / (24 * 60 * 60 * 1000));
      const label = dayNames[diffDays] || start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(e);
    });

    let calendarContext = "";
    for (const [label, events] of Object.entries(grouped)) {
      calendarContext += `\n${label}:\n${events.map(formatEvent).join("\n")}`;
    }

    const calendarIntro = `

Here are upcoming calendar events pulled from Steven and Leah's Google Calendars.
Format: [CalendarOwner] Event Title at Time
Rules for interpreting this data:
- [CalendarOwner] is whose Google Calendar the event is on, not necessarily who is attending.
- If the exact same event title and time appears on BOTH [Steven] and [Leah] calendars, they are attending together.
- If it only appears on one person's calendar, only that person is involved.
- Events named after Henry or Toni are kid-related events tracked by that parent — not events Steven or Leah are personally attending.
- steven-work refers to Steven's work calendar at Conifore LLC.
`;

    let weatherContext = "";
    if (this.weatherData) {
      const cur = this.weatherData.current;
      const desc = cur && cur.weather && cur.weather[0] ? cur.weather[0].description : "";
      const temp = cur ? Math.round(cur.temp) : null;
      if (temp !== null) weatherContext = `\n\nCurrent weather in Seattle: ${temp}°F, ${desc}.`;
      const daily = (this.weatherData.daily || []).slice(0, 4);
      if (daily.length > 0) {
        const dayLabels = ["Today", "Tomorrow"];
        const dayLines = daily.map((d, i) => {
          const label = dayLabels[i] || new Date(d.dt * 1000).toLocaleDateString("en-US", { weekday: "long" });
          const hi = Math.round(d.temp.max);
          const lo = Math.round(d.temp.min);
          const summary = d.weather && d.weather[0] ? d.weather[0].description : "";
          return `${label}: high ${hi}°F / low ${lo}°F, ${summary}`;
        });
        weatherContext += `\nForecast:\n${dayLines.join("\n")}`;
      }
      console.log("[MMM-ClaudeBriefing] Weather context:", weatherContext);
    }

    const fullPrompt = calendarContext.length > 0 || weatherContext.length > 0
      ? `${this.config.prompt}${weatherContext}${calendarIntro}${calendarContext}`
      : this.config.prompt;

    console.log("[MMM-ClaudeBriefing] Final prompt being sent to Claude:\n", fullPrompt);

    this.sendSocketNotification("FETCH_BRIEFING", {
      apiKey: this.config.apiKey,
      model: this.config.model,
      prompt: fullPrompt,
      maxTokens: this.config.maxTokens,
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BRIEFING_RESULT") {
      this.briefingText = payload.text;
      this.loaded = true;
      this.updateDom(300);
    }
    if (notification === "BRIEFING_ERROR") {
      this.briefingText = "Could not load briefing.";
      this.updateDom();
    }
  },

});
