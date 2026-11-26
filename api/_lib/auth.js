import crypto from "node:crypto";
import { ensureUserSheet, readRows, userHeaders, writeRows } from "./sheets.js";

const cookieName = "spp_session";
const b64 = value => Buffer.from(value).toString("base64url");
const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
export function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || "").split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex"), actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function secret() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not configured");
  return process.env.AUTH_SECRET;
}
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return body + "." + crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}
function unsign(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest(), actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString()); return payload.exp > Date.now() ? payload : null; } catch { return null; }
}
function cookieValue(req) {
  const header = req.headers?.cookie || "";
  return header.split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || "";
}
export function setSession(res, userId) {
  const token = sign({ userId, exp: Date.now() + 12 * 60 * 60 * 1000 });
  res.setHeader("Set-Cookie", cookieName + "=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
}
export function clearSession(res) { res.setHeader("Set-Cookie", cookieName + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : "")); }
function mapUsers(rows) {
  const [headers, ...records] = rows;
  const keys = (headers || userHeaders).map(String);
  return records.filter(row => row.some(value => String(value || "").trim())).map(row => Object.fromEntries(keys.map((key, i) => [key, row[i] ?? ""])));
}
export async function allUsers() {
  await ensureUserSheet();
  let rows = await readRows("User"), users = mapUsers(rows);
  if (!users.length) {
    const username = String(process.env.INITIAL_ADMIN_USERNAME || "Thaanpron.p").trim();
    const password = String(process.env.INITIAL_ADMIN_PASSWORD || "");
    if (!password) throw new Error("INITIAL_ADMIN_PASSWORD is required to initialize the first Admin account");
    const permissions = Object.fromEntries(["dashboard", "records", "Part", "Material", "Part.Materials", "Machine", "WasteRecord"].map(name => [name, { view: true, edit: true }]));
    await writeRows("User", [[username, hashPassword(password), "admin", JSON.stringify(permissions), true, true, new Date().toISOString()]]);
    rows = await readRows("User"); users = mapUsers(rows);
  }
  return users;
}
export async function addUser(user) { return writeRows("User", [[user.UserID, user.PasswordHash, user.Role, JSON.stringify(user.Permissions), user.Active, user.MustChangePassword, user.CreatedAt]]); }
export async function updateUserRows(users) {
  const rows = [userHeaders, ...users.map(user => [user.UserID, user.PasswordHash, user.Role, JSON.stringify(user.Permissions), user.Active, user.MustChangePassword, user.CreatedAt])];
  const { replaceRows } = await import("./sheets.js");
  return replaceRows("User", rows);
}
export function publicUser(user) {
  let permissions = {};
  try { permissions = typeof user.Permissions === "string" ? JSON.parse(user.Permissions || "{}") : user.Permissions || {}; } catch { }
  return { userId: String(user.UserID), role: String(user.Role || "user"), permissions, active: String(user.Active).toLowerCase() !== "false", mustChangePassword: String(user.MustChangePassword).toLowerCase() === "true" };
}
export async function currentUser(req) {
  const payload = unsign(cookieValue(req));
  if (!payload) return null;
  const user = (await allUsers()).find(entry => String(entry.UserID).toLocaleLowerCase() === String(payload.userId).toLocaleLowerCase());
  if (!user || String(user.Active).toLowerCase() === "false") return null;
  return { ...publicUser(user), passwordHash: String(user.PasswordHash || "") };
}
export async function requireUser(req, res, permission, level = "view") {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" }); return null; }
  if (user.mustChangePassword && permission !== "change-password") { res.status(403).json({ error: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน", mustChangePassword: true }); return null; }
  if (user.role === "admin") return user;
  const grant = user.permissions?.[permission];
  if (!grant || (level === "edit" ? grant.edit !== true : grant.view !== true)) { res.status(403).json({ error: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนนี้" }); return null; }
  return user;
}
export async function login(username, password) {
  const user = (await allUsers()).find(entry => String(entry.UserID).toLocaleLowerCase() === String(username || "").trim().toLocaleLowerCase());
  if (!user || String(user.Active).toLowerCase() === "false" || !verifyPassword(String(password || ""), user.PasswordHash)) return null;
  return { ...publicUser(user), passwordHash: String(user.PasswordHash || "") };
}
export { hashPassword };

