/**
 * MMM-TeslaEnergy — one-time OAuth authorization script
 *
 * Usage:
 *   1. Fill in credentials.json with your Tesla app client_id and client_secret
 *   2. Run: node authorize.js
 *   3. Open the printed URL in a browser and log in with your Tesla account
 *   4. After redirect, paste the full redirect URL back into the terminal
 *   5. token.json is saved — MagicMirror will use it automatically
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");

const CREDENTIALS_FILE = path.join(__dirname, "credentials.json");
const TOKEN_FILE = path.join(__dirname, "token.json");

const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
const TESLA_TOKEN_URL = "https://auth.tesla.com/oauth2/v3/token";

const SCOPES = "openid offline_access energy_device_data";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function main() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error(`
ERROR: credentials.json not found.

Create it at: ${CREDENTIALS_FILE}

Contents:
{
  "client_id": "YOUR_TESLA_CLIENT_ID",
  "client_secret": "YOUR_TESLA_CLIENT_SECRET",
  "redirect_uri": "https://auth.tesla.com/void/callback"
}

Get these from: https://developer.tesla.com → your app → Credentials
`);
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
  const { client_id, client_secret, redirect_uri } = creds;

  if (!client_id || !client_secret || !redirect_uri) {
    console.error("ERROR: credentials.json must have client_id, client_secret, and redirect_uri");
    process.exit(1);
  }

  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));

  const params = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${TESLA_AUTH_URL}?${params.toString()}`;

  console.log("\n=== MMM-TeslaEnergy Authorization ===\n");
  console.log("1. Open this URL in your browser:\n");
  console.log("   " + authUrl);
  console.log("\n2. Log in with your Tesla account and approve access.");
  console.log("\n3. You will be redirected to a URL that starts with your redirect_uri.");
  console.log("   The page may show an error — that's fine. Copy the full URL from the address bar.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question("4. Paste the full redirect URL here: ", async (redirected) => {
    rl.close();

    let code;
    try {
      const url = new URL(redirected);
      code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      if (returnedState !== state) {
        console.error("ERROR: State mismatch — possible CSRF. Try again.");
        process.exit(1);
      }
    } catch (e) {
      console.error("ERROR: Could not parse URL:", e.message);
      process.exit(1);
    }

    if (!code) {
      console.error("ERROR: No code found in redirect URL");
      process.exit(1);
    }

    console.log("\nExchanging authorization code for tokens...");

    const res = await fetch(TESLA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id,
        client_secret,
        code,
        redirect_uri,
        code_verifier: verifier,
      }).toString(),
    });

    const data = await res.json();

    if (!data.access_token) {
      console.error("ERROR: Token exchange failed:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const token = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 28800) * 1000,
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    console.log("\n✓ token.json saved successfully!");
    console.log("  MagicMirror will now use this token automatically.");
    console.log("  Tokens refresh automatically — you should not need to run this again.\n");
  });
}

main().catch(e => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
