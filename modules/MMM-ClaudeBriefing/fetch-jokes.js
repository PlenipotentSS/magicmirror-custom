#!/usr/bin/env node
/**
 * fetch-jokes.js
 * Builds jokes.json from three sources:
 *   1. icanhazdadjoke.com  — ~744 jokes (paginated API)
 *   2. taivop/joke-dataset — wocka.json + stupidstuff.json (category-filtered)
 *   3. taivop/joke-dataset — reddit_jokes.json (score + keyword filtered)
 *
 * Usage:
 *   node fetch-jokes.js
 *   node fetch-jokes.js --output /path/to/jokes.json
 */

const fs   = require("fs");
const path = require("path");

const PAGE_SIZE   = 30;
const DELAY_MS    = 300;
const OUTPUT_PATH = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : path.join(__dirname, "jokes.json");

const RAW_BASE = "https://raw.githubusercontent.com/taivop/joke-dataset/master";

const ICANHAZ_HEADERS = {
  "Accept":     "application/json",
  "User-Agent": "MagicMirror-MMM-ClaudeBriefing/1.0 (github.com/stevenstevenson/magicmirror-custom)",
};

// ── filters ───────────────────────────────────────────────────────────────────

const BLOCKED_CATEGORIES = new Set([
  // wocka
  "Gross", "Yo Momma", "Insults", "Redneck", "Religious", "News / Politics",
  "Men / Women",
  // stupidstuff
  "Political", "Blonde Jokes", "Men",
  // shared
  "Blond",
]);

// Keyword blocklist applied to joke text (reddit + anywhere categories can't save us)
const BLOCKED_TERMS = [
  /\bn[i*]gg/i, /\bf[a*]g(g?ot)?/i, /\bretard/i, /\bspic\b/i, /\bchink\b/i,
  /\bkike\b/i,  /\btranny/i,         /\bcunt\b/i,  /\bslut\b/i,  /\bwhore\b/i,
  /\brape[sd]?\b/i, /\bmolest/i,     /\bpedoph/i,  /\bincest\b/i,
  /\bsuicid/i,  /\bself.harm/i,      /\bterror/i,  /\bholocaust/i,
  /\bmuslim/i,  /\bjew(ish)?\b/i,   /\bblack people\b/i, /\bwhite people\b/i,
  /\bsex\b/i,   /\bporn/i,           /\bdick\b/i,  /\bpenis/i,    /\bvagina/i,
  /\bass\b/i,   /\bshit\b/i,         /\bfuck/i,    /\bdamn\b/i,   /\bbitch\b/i,
  /\bhell\b/i,  /\bcrap\b/i,         /\bboob/i,    /\bbreasts?\b/i,
  /\bprick(s)?\b/i, /\bbastard\b/i,  /\bnazi\b/i,
  /\bfat\b/i,       /\bobese\b/i,    /\boverweight\b/i,
  /\bchubby\b/i,    /\bplump\b/i,
];

function isClean(text) {
  return !BLOCKED_TERMS.some(re => re.test(text));
}

function isGoodLength(text) {
  return text.length >= 20 && text.length <= 500;
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

// Strip title/header line from wocka, stupidstuff, and reddit jokes that use
// a short label as the first line before the actual joke body.
function stripHeader(text, idPrefix) {
  const lines = text.split("\n");
  if (lines.length < 2) return text;
  const first = lines[0].trim();
  const rest  = lines.slice(1).join("\n").trim();
  if (!rest) return text;

  if (idPrefix === "wocka" || idPrefix === "stupidstuff") return rest;

  // Reddit: strip if first line is a short label (no sentence-ending punctuation,
  // doesn't start like a sentence)
  if (first.length <= 80
      && !/[.!?]$/.test(first)
      && !/^(I |He |She |They |We |You |A |An |The )/.test(first)
      && /[A-Z]/.test(first)) {
    return rest;
  }
  return text;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Source 1: icanhazdadjoke.com ─────────────────────────────────────────────

async function fetchIcanHaz() {
  console.log("\n── Source 1: icanhazdadjoke.com ────────────────────────────");

  const first = await fetch(
    `https://icanhazdadjoke.com/search?limit=${PAGE_SIZE}&page=1`,
    { headers: ICANHAZ_HEADERS }
  ).then(r => r.json());

  const totalPages = Math.ceil(first.total_jokes / PAGE_SIZE);
  console.log(`   ${first.total_jokes} jokes available → ${totalPages} pages`);

  const seen  = new Set();
  const jokes = [];

  function absorb(results) {
    for (const j of results) {
      const text = normalize(j.joke || "");
      if (!seen.has(j.id) && isGoodLength(text) && isClean(text)) {
        seen.add(j.id);
        jokes.push({ id: `icanhaz-${j.id}`, joke: text });
      }
    }
  }

  absorb(first.results);
  process.stdout.write(`   Page  1/${totalPages} — ${jokes.length} so far\r`);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const data = await fetch(
        `https://icanhazdadjoke.com/search?limit=${PAGE_SIZE}&page=${page}`,
        { headers: ICANHAZ_HEADERS }
      ).then(r => r.json());
      absorb(data.results);
      process.stdout.write(`   Page ${String(page).padStart(2)}/${totalPages} — ${jokes.length} so far\r`);
    } catch (err) {
      console.warn(`\n   ⚠ Skipping page ${page}: ${err.message}`);
    }
  }

  console.log(`\n   Collected ${jokes.length} from icanhazdadjoke`);
  return jokes;
}

// ── Source 2: wocka.json + stupidstuff.json ───────────────────────────────────

async function fetchDataset(filename, idPrefix) {
  console.log(`\n── ${filename} ─────────────────────────────────────────────`);
  const raw = await fetch(`${RAW_BASE}/${filename}`).then(r => r.text());
  const data = JSON.parse(raw);

  const jokes = [];
  for (const entry of data) {
    if (BLOCKED_CATEGORIES.has(entry.category)) continue;

    const text = normalize(entry.body || "");

    if (!isGoodLength(text) || !isClean(text)) continue;

    // stupidstuff: require rating >= 3.0 (scale ~1–5)
    if (entry.rating !== undefined && entry.rating < 3.0) continue;

    jokes.push({ id: `${idPrefix}-${entry.id}`, joke: text });
  }

  console.log(`   ${data.length} total → ${jokes.length} kept after filtering`);
  return jokes;
}

// ── Source 3: reddit_jokes.json ───────────────────────────────────────────────
// 195k entries — use score >= 500 to keep only community-validated jokes,
// then apply keyword filter on title+body combined.

async function fetchReddit() {
  console.log("\n── reddit_jokes.json ───────────────────────────────────────");
  console.log("   Downloading ~195k entries (this may take a moment)…");

  const raw  = await fetch(`${RAW_BASE}/reddit_jokes.json`).then(r => r.text());
  const data = JSON.parse(raw);

  const MIN_SCORE = 500;
  const jokes = [];

  for (const entry of data) {
    if ((entry.score || 0) < MIN_SCORE) continue;

    const combined = stripHeader(normalize(`${entry.title}\n${entry.body}`), "reddit");
    if (!isGoodLength(combined) || !isClean(combined)) continue;

    jokes.push({ id: `reddit-${entry.id}`, joke: combined });
  }

  console.log(`   ${data.length} total → ${jokes.length} kept (score ≥ ${MIN_SCORE} + clean filter)`);
  return jokes;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Building jokes.json from multiple sources…");

  const icanhaz     = await fetchIcanHaz();
  const wocka       = await fetchDataset("wocka.json",       "wocka");
  const stupidstuff = await fetchDataset("stupidstuff.json", "stupidstuff");
  const reddit      = await fetchReddit();

  // Merge all sources
  const all = [...icanhaz, ...wocka, ...stupidstuff, ...reddit];

  // Deduplicate by normalized text
  const seenText = new Set();
  const merged   = [];
  for (const j of all) {
    const norm = j.joke.toLowerCase().replace(/\s+/g, " ");
    if (!seenText.has(norm)) {
      seenText.add(norm);
      merged.push(j);
    }
  }

  // Shuffle
  for (let i = merged.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[k]] = [merged[k], merged[i]];
  }

  console.log(`\n── Results ─────────────────────────────────────────────────`);
  console.log(`   icanhazdadjoke: ${icanhaz.length}`);
  console.log(`   wocka:          ${wocka.length}`);
  console.log(`   stupidstuff:    ${stupidstuff.length}`);
  console.log(`   reddit:         ${reddit.length}`);
  console.log(`   After dedup:    ${merged.length} total`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), "utf8");

  const days  = Math.floor(merged.length / 2);
  const years = (days / 365).toFixed(1);
  console.log(`\n   Saved to: ${OUTPUT_PATH}`);
  console.log(`   At 2 jokes/day: ${days} days (${years} years) before any repeats.\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
