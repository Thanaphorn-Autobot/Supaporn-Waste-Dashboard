import crypto from "node:crypto";

const cookieName = "spp_admin_session";
const encode = value => Buffer.from(value).toString("base64url");
function authSecret() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not configured");
  return process.env.AUTH_SECRET;
}
function sign(payload) {
  const body = encode(JSON.stringify(payload));
  return body + "." + crypto.createHmac("sha256", authSecret()).update(body).digest("base64url");
}
function verify(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return false;
  const expected = crypto.createHmac("sha256", authSecret()).update(body).digest(), actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString()); return payload.role === "admin" && payload.exp > Date.now(); } catch { return false; }
}
function cookieToken(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || "";
}
export function setAdminSession(res) {
  const value = sign({ role: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", cookieName + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
}
export function clearAdminSession(res) {
  res.setHeader("Set-Cookie", cookieName + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
}
export function currentAdmin(req) { return verify(cookieToken(req)) ? { role: "admin", userId: "Admin" } : null; }
export function passwordMatches(input) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) throw new Error("ADMIN_PASSWORD is not configured in the deployment environment");
  const candidate = Buffer.from(String(input || ""));
  const expected = Buffer.from(configured);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

