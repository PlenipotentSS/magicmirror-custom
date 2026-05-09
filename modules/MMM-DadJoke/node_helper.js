const NodeHelper = require("node_helper");
const fs   = require("fs");
const path = require("path");

// Shared with MMM-ClaudeBriefing — same corpus and state files
const JOKES_FILE = path.join(__dirname, "../MMM-ClaudeBriefing/jokes.json");
const STATE_FILE = path.join(__dirname, "../MMM-ClaudeBriefing/jokes-state.json");

module.exports = NodeHelper.create({

  start() {
    this._jokes     = [];
    this._jokeQueue = [];
    this._jokeState = {};
    this._loaded    = false;
  },

  socketNotificationReceived(notification) {
    if (notification !== "GET_JOKE") return;
    if (!this._loaded) this._initJokes();
    const joke = this._getNextJoke();
    this.sendSocketNotification("JOKE_RESULT", { joke: joke || "" });
  },

  _initJokes() {
    try {
      this._jokes = JSON.parse(fs.readFileSync(JOKES_FILE, "utf8"));
      console.log(`[MMM-DadJoke] Loaded ${this._jokes.length} jokes`);
    } catch (e) {
      console.warn("[MMM-DadJoke] Could not load jokes.json:", e.message);
      return;
    }

    try {
      const state    = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      const validIds = new Set(this._jokes.map(j => j.id));
      const filtered = (state.queue || []).filter(id => validIds.has(id));
      this._jokeQueue = filtered.length > 0 ? filtered : this._buildShuffledQueue();
      this._jokeState = state.served || {};
    } catch (_) {
      this._jokeQueue = this._buildShuffledQueue();
    }

    this._loaded = true;
  },

  _getNextJoke() {
    if (!this._jokes.length) return null;

    const now     = new Date();
    const dateKey = now.toLocaleDateString("en-CA");
    const slot    = now.getHours() < 12 ? "am" : "pm";
    const slotKey = `${dateKey}-${slot}`;

    if (this._jokeState[slotKey]) {
      console.log(`[MMM-DadJoke] Replaying joke for slot ${slotKey}`);
      return this._jokeState[slotKey];
    }

    if (this._jokeQueue.length === 0) {
      console.log("[MMM-DadJoke] Corpus exhausted — reshuffling");
      this._jokeQueue = this._buildShuffledQueue();
    }

    const nextId = this._jokeQueue.shift();
    const entry  = this._jokes.find(j => j.id === nextId);
    const text   = entry ? entry.joke : null;

    if (text) {
      this._jokeState[slotKey] = text;
      // Keep only last 4 slots (2 days)
      const keys = Object.keys(this._jokeState).sort();
      if (keys.length > 4) {
        keys.slice(0, keys.length - 4).forEach(k => delete this._jokeState[k]);
      }
    }

    this._saveState();
    return text;
  },

  _buildShuffledQueue() {
    const ids = this._jokes.map(j => j.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[k]] = [ids[k], ids[i]];
    }
    return ids;
  },

  _saveState() {
    try {
      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify({ queue: this._jokeQueue, served: this._jokeState, updatedAt: new Date().toISOString() }),
        "utf8"
      );
    } catch (e) {
      console.warn("[MMM-DadJoke] Could not save jokes-state.json:", e.message);
    }
  },

});
