/**
 * MMM-ClaudeBriefing — joke-manager patch
 *
 * Drop this block into node_helper.js alongside your existing start() / socketNotificationReceived().
 * It replaces the old "pick a random joke from jokes.json" logic with:
 *   - Sequential cycling through all jokes (no repeats until all are shown)
 *   - Persistent progress saved to jokes-state.json
 *   - Auto-reset when the corpus is exhausted (reshuffles then starts over)
 *   - Graceful fallback if jokes.json is missing or empty
 *
 * ─── INTEGRATION STEPS ───────────────────────────────────────────────────────
 *
 * 1. In start(), replace your existing joke-loading code with:
 *
 *      start() {
 *        console.log("MMM-ClaudeBriefing helper started");
 *        this.initJokes();          // ← add this
 *      }
 *
 * 2. Replace wherever you currently call jokes.json with:
 *
 *      const joke = this.getNextJoke();
 *
 * 3. Then inject `joke` into your Claude prompt string, e.g.:
 *
 *      const jokeSection = joke
 *        ? `\n\nEnd your briefing with this joke of the day (deliver it naturally, don't announce it as "the joke"):\n${joke}`
 *        : "";
 *
 *      // then append jokeSection to your prompt before sending to Anthropic API
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require("fs");
const path = require("path");

const JOKES_FILE = path.join(__dirname, "jokes.json");
const STATE_FILE = path.join(__dirname, "jokes-state.json");

// ── joke manager methods — add these to your NodeHelper.create({...}) object ──

/**
 * Call once in start(). Loads jokes corpus + restores progress.
 */
function initJokes() {
  this._jokes = [];
  this._jokeQueue = [];

  try {
    const raw = fs.readFileSync(JOKES_FILE, "utf8");
    this._jokes = JSON.parse(raw);
    console.log(`[ClaudeBriefing] Loaded ${this._jokes.length} jokes from jokes.json`);
  } catch (e) {
    console.warn("[ClaudeBriefing] Could not load jokes.json:", e.message);
    return;
  }

  // Restore or initialise queue
  let savedQueue = null;
  try {
    const stateRaw = fs.readFileSync(STATE_FILE, "utf8");
    const state    = JSON.parse(stateRaw);
    // Validate: all saved IDs still exist in current corpus
    const validIds = new Set(this._jokes.map(j => j.id));
    const filtered = (state.queue || []).filter(id => validIds.has(id));
    if (filtered.length > 0) {
      savedQueue = filtered;
      console.log(`[ClaudeBriefing] Restored joke queue — ${savedQueue.length} remaining`);
    }
  } catch (_) {
    // No state file yet — that's fine
  }

  this._jokeQueue = savedQueue || this._buildShuffledQueue();
}

/**
 * Returns the next joke string, advancing and persisting the queue.
 * Returns null if no jokes are available.
 */
function getNextJoke() {
  if (!this._jokes || this._jokes.length === 0) return null;

  // If queue empty, start a fresh cycle
  if (this._jokeQueue.length === 0) {
    console.log("[ClaudeBriefing] Joke corpus exhausted — reshuffling for a new cycle");
    this._jokeQueue = this._buildShuffledQueue();
  }

  const nextId = this._jokeQueue.shift();
  const entry  = this._jokes.find(j => j.id === nextId);

  // Persist remaining queue
  this._saveJokeState();

  return entry ? entry.joke : null;
}

/**
 * Builds a shuffled array of joke IDs (Fisher-Yates).
 */
function buildShuffledQueue() {
  const ids = this._jokes.map(j => j.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/**
 * Writes remaining queue IDs to jokes-state.json.
 */
function saveJokeState() {
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ queue: this._jokeQueue, updatedAt: new Date().toISOString() }),
      "utf8"
    );
  } catch (e) {
    console.warn("[ClaudeBriefing] Could not save jokes-state.json:", e.message);
  }
}

// ── EXPORT as a mixin-ready object ────────────────────────────────────────────
// In your NodeHelper.create({...}), spread or manually copy these methods:
//
//   module.exports = NodeHelper.create({
//     start() { this.initJokes(); ... },
//     initJokes,
//     getNextJoke,
//     _buildShuffledQueue: buildShuffledQueue,
//     _saveJokeState: saveJokeState,
//     async socketNotificationReceived(...) { ... }
//   });
//
// Then in your FETCH_BRIEFING handler, where you build the Claude prompt:
//
//   const joke = this.getNextJoke();
//   const jokeSection = joke
//     ? `\n\nEnd your briefing with this joke of the day. Work it in naturally — don't say "here's the joke", just let it land:\n\n${joke}`
//     : "";
//
//   // ...append jokeSection to your prompt string before the API call

module.exports = { initJokes, getNextJoke, buildShuffledQueue, saveJokeState };
