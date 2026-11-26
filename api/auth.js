import { allUsers, clearSession, currentUser, hashPassword, login, publicUser, setSession, updateUserRows, verifyPassword } from "./_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  try {
    const action = String(req.query?.action || "me");
    if (req.method === "GET" && action === "me") {
      const user = await currentUser(req);
      return res.status(200).json({ user: user ? publicUser(user) : null });
    }
    if (req.method === "POST" && action === "login") {
      const user = await login(req.body?.username, req.body?.password);
      if (!user) return res.status(401).json({ error: "User ID หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน" });
      setSession(res, user.userId);
      return res.status(200).json({ user: publicUser(user) });
    }
    if (req.method === "POST" && action === "logout") {
      clearSession(res);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && action === "change-password") {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบใหม่" });
      const currentPassword = String(req.body?.currentPassword || ""), newPassword = String(req.body?.newPassword || "");
      if (!verifyPassword(currentPassword, user.passwordHash)) return res.status(400).json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      if (newPassword.length < 6) return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
      const users = await allUsers();
      const target = users.find(entry => String(entry.UserID).toLocaleLowerCase() === user.userId.toLocaleLowerCase());
      target.PasswordHash = hashPassword(newPassword); target.MustChangePassword = false;
      await updateUserRows(users);
      return res.status(200).json({ user: publicUser(target) });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "ระบบยืนยันตัวตนขัดข้อง" });
  }
}

