import { clearAdminSession, currentAdmin, passwordMatches, setAdminSession } from "./_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  try {
    const action = String(req.query?.action || "me");
    if (req.method === "GET" && action === "me") return res.status(200).json({ authenticated: Boolean(currentAdmin(req)) });
    if (req.method === "POST" && action === "login") {
      if (!passwordMatches(req.body?.password)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
      setAdminSession(res);
      return res.status(200).json({ authenticated: true });
    }
    if (req.method === "POST" && action === "logout") {
      clearAdminSession(res);
      return res.status(200).json({ authenticated: false });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "ระบบเข้าสู่ระบบขัดข้อง" });
  }
}

