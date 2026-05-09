/* MMM-ClaudeBriefing — node_helper.js
 * Runs server-side to call Anthropic API securely
 */

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({

  start() {
    console.log("MMM-ClaudeBriefing helper started");
  },

  async socketNotificationReceived(notification, payload) {
    if (notification !== "FETCH_BRIEFING") return;

    const { apiKey, model, prompt, maxTokens } = payload;

    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: `Today is ${dateStr} at ${timeStr} in Seattle, WA.\n\n${prompt}`
            }
          ]
        })
      });

      const data = await response.json();

      if (data?.content?.[0]?.text) {
        this.sendSocketNotification("BRIEFING_RESULT", { text: data.content[0].text.trim() });
      } else {
        throw new Error("Unexpected API response shape");
      }

    } catch (err) {
      console.error("MMM-ClaudeBriefing error:", err.message);
      this.sendSocketNotification("BRIEFING_ERROR", { error: err.message });
    }
  }

});
