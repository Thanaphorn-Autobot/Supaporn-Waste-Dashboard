import crypto from "node:crypto";

const spreadsheetId = process.env.GOOGLE_SHEETS_ID || "1Oh4I2T-GyDrMHYwCiCrVGlJLUH1kwqwo8Jgs1Z9tDDM";
let cachedToken = null, tokenExpiresAt = 0;

function encode(value) { return Buffer.from(value).toString("base64url"); }
async function accessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Google Sheets private access is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encode(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = header + "." + claim;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + signature }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || "Unable to authenticate with Google Sheets");
  cachedToken = payload.access_token; tokenExpiresAt = Date.now() + payload.expires_in * 1000;
  return cachedToken;
}
async function request(path, options = {}) {
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + path, { ...options, headers: { Authorization: "Bearer " + await accessToken(), ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "Google Sheets request failed (" + response.status + ")");
  return payload;
}
export const tabs = ["Part", "Material", "Part.Materials", "Machine", "WasteRecord"];
export async function readRows(tab) {
  const range = encodeURIComponent("'" + tab.replace(/'/g, "''") + "'!A:ZZ");
  const payload = await request("/values/" + range + "?valueRenderOption=UNFORMATTED_VALUE");
  return payload.values || [];
}
export async function writeRows(tab, rows, mode = "append") {
  const range = encodeURIComponent("'" + tab.replace(/'/g, "''") + "'!A1");
  const endpoint = mode === "append" ? "/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS" : "/values/" + range + "?valueInputOption=RAW";
  return request(endpoint, { method: mode === "append" ? "POST" : "PUT", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) });
}
export async function replaceRows(tab, rows) {
  const range = encodeURIComponent("'" + tab.replace(/'/g, "''") + "'!A:ZZ");
  await request("/values/" + range + ":clear", { method: "POST", body: "{}" });
  if (rows.length) await writeRows(tab, rows, "replace");
}
export async function sheetMeta() { return request("?fields=sheets.properties(sheetId,title,gridProperties)"); }

