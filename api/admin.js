import { allUsers, addUser, currentUser, hashPassword, publicUser, updateUserRows } from "./_lib/auth.js";
import { readRows, replaceRows, tabs, userHeaders, writeRows } from "./_lib/sheets.js";

const key = value => String(value || "").trim().toLocaleLowerCase("th").replace(/\s+/g, " ");
const permissionNames = ["dashboard", "records", ...tabs];
const defaultPermissions = Object.fromEntries(permissionNames.map(name => [name, { view: false, edit: false }]));
const json = (res, status, data) => res.status(status).json(data);
function csvDate(value) {
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  const raw = String(value || "").trim();
  const thai = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (thai) return Number(thai[3]) > 2400 ? `${Number(thai[3]) - 543}-${thai[2].padStart(2,"0")}-${thai[1].padStart(2,"0")}` : `${thai[3]}-${thai[2].padStart(2,"0")}-${thai[1].padStart(2,"0")}`;
  const d = new Date(raw); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
}
function headerIndex(headers, candidates) { return headers.findIndex(h => candidates.includes(key(h))); }
function primaryKey(tab, headers, row) {
  const cols = tab === "Part" ? ["partid"] : tab === "Material" ? ["materialid"] : tab === "Part.Materials" ? ["partid", "materialid"] : tab === "Machine" ? ["machineid", "m/c no", "machine no"] : ["partid", "วันที่ผลิต", "date", "po no", "m/c no"];
  const idx = cols.map(name => headers.findIndex(h => key(h) === name)).filter(i => i >= 0);
  return idx.length ? idx.map(i => key(row[i])).join("|") : "";
}
function inspectImport(tab, headers, rows, existing) {
  const problems = [], warnings = [];
  if (!tabs.includes(tab)) return { valid: false, problems: ["ไม่รองรับชีตนี้"] , warnings };
  if (!Array.isArray(headers) || !headers.length || !Array.isArray(rows) || !rows.length) return { valid: false, problems: ["ไฟล์ไม่มีหัวตารางหรือไม่มีข้อมูล"], warnings };
  if (headers.some(v => !String(v || "").trim())) problems.push("มีชื่อคอลัมน์ว่าง");
  if (new Set(headers.map(key)).size !== headers.length) problems.push("มีชื่อคอลัมน์ซ้ำ");
  const knownHeaders = existing[0] || [];
  if (knownHeaders.length && (headers.length !== knownHeaders.length || headers.some((h,i) => key(h) !== key(knownHeaders[i])))) problems.push("หัวคอลัมน์ไม่ตรงกับชีตปลายทาง");
  if (rows.some(row => !Array.isArray(row) || row.length !== headers.length)) problems.push("มีแถวที่จำนวนข้อมูลไม่ตรงกับจำนวนคอลัมน์");
  if (problems.length) return { valid:false, problems:[...new Set(problems)], warnings };
  const seen = new Set(), known = new Set((existing.slice(1) || []).map(row => primaryKey(tab, knownHeaders, row)).filter(Boolean));
  for (let i=0;i<rows.length;i++) {
    const signature = primaryKey(tab, headers, rows[i]);
    if (signature && (seen.has(signature) || known.has(signature))) problems.push(`ข้อมูลซ้ำที่แถว ${i+2}: ${signature}`);
    if (signature) seen.add(signature);
  }
  const values = Object.fromEntries(headers.map((h,i) => [key(h), i]));
  const requiredByTab = {
    Part: [["partid"]], Material: [["materialid"]], "Part.Materials": [["partid"],["materialid"]],
    Machine: [["machineid","m/c no","machine no"]],
    WasteRecord: [["วันที่ผลิต","date","production date"],["part no","partno","รหัสชิ้นงาน"],["จำนวนผลิต","produced qty","produced"],["ng","จำนวน ng"]],
  };
  for (const candidates of requiredByTab[tab] || []) if (headerIndex(headers,candidates) < 0) problems.push("ขาดคอลัมน์จำเป็น: " + candidates[0]);
  if (problems.length) return { valid:false, problems, warnings };
  const numericFields = tab === "Part" ? ["part (g)","runner (g)","loss (%)"] : tab === "Part.Materials" ? ["ratio"] : tab === "WasteRecord" ? ["จำนวนผลิต","produced qty","produced","ng","จำนวน ng"] : [];
  for (const field of numericFields) {
    const index = values[field]; if (index === undefined) continue;
    rows.forEach((row,i) => { const raw=String(row[index]??"").trim(); if(!raw)return; const n=Number(raw.replace(/[,% ]/g,"")); if(!Number.isFinite(n))problems.push(`แถว ${i+2}: ${field} ไม่ใช่ตัวเลข`); else if(n<0)problems.push(`แถว ${i+2}: ${field} ต้องไม่ติดลบ`); });
  }
  if (tab === "WasteRecord") {
    const produced=headerIndex(headers,["จำนวนผลิต","produced qty","produced"]), ng=headerIndex(headers,["ng","จำนวน ng"]);
    rows.forEach((row,i)=>{if(Number(String(row[ng]||0).replace(/[, ]/g,""))>Number(String(row[produced]||0).replace(/[, ]/g,"")))warnings.push(`แถว ${i+2}: จำนวน NG มากกว่าจำนวนผลิต`);});
  }
  if (tab === "Part.Materials") {
    const parts = new Set((existing.Part || []).slice(1).map(row=>key(row[headerIndex(existing.Part[0], ["partid"])] )).filter(Boolean));
    const materials = new Set((existing.Material || []).slice(1).map(row=>key(row[headerIndex(existing.Material[0], ["materialid"])] )).filter(Boolean));
    rows.forEach((row,i)=>{ if (values.partid !== undefined && !parts.has(key(row[values.partid]))) warnings.push(`แถว ${i+2}: PartID ไม่พบในชีต Part`); if (values.materialid !== undefined && !materials.has(key(row[values.materialid]))) warnings.push(`แถว ${i+2}: MaterialID ไม่พบในชีต Material`); });
  }
  if (tab === "WasteRecord") {
    const parts = new Set((existing.Part || []).slice(1).map(row=>key(row[headerIndex(existing.Part[0], ["partid"])] )).filter(Boolean));
    if (values.partid !== undefined) rows.forEach((row,i)=>{ if (row[values.partid] && !parts.has(key(row[values.partid])) && !/^#(N\/A|REF!|VALUE!)/i.test(String(row[values.partid]))) warnings.push(`แถว ${i+2}: PartID ไม่พบในชีต Part`); });
  }
  return { valid: !problems.length, problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
}
async function loadExisting() { const data = {}; await Promise.all(tabs.map(async tab => data[tab] = await readRows(tab))); return data; }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  try {
    const user = await currentUser(req);
    if (!user) return json(res,401,{error:"กรุณาเข้าสู่ระบบ"});
    if (user.mustChangePassword) return json(res,403,{error:"กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน",mustChangePassword:true});
    if (req.method === "GET") {
      const action = String(req.query?.action || "sheets");
      if (action === "users") { if(user.role!=="admin")return json(res,403,{error:"เฉพาะ Admin เท่านั้น"}); return json(res,200,{users:(await allUsers()).map(publicUser)}); }
      if (action === "sheets") return json(res,200,{sheets:tabs});
      if (action === "sheet" || action === "template") {
        const tab = String(req.query?.tab || "");
        if (!tabs.includes(tab)) return json(res,400,{error:"ไม่พบชีตที่เลือก"});
        const allowed = user.role === "admin" || user.permissions?.[tab]?.view;
        if (!allowed) return json(res,403,{error:"ไม่มีสิทธิ์ดูข้อมูลชีตนี้"});
        const rows = await readRows(tab);
        return json(res,200,{tab,headers:rows[0]||[],rows:action === "sheet" ? rows.slice(1) : []});
      }
      if (action === "all") {
        const denied = tabs.filter(tab => user.role !== "admin" && !user.permissions?.[tab]?.view);
        if (denied.length) return json(res,403,{error:"ต้องมีสิทธิ์ดูข้อมูลทุกชีตก่อนดาวน์โหลดทั้งหมด",denied});
        return json(res,200,{data:await loadExisting()});
      }
      if (action === "export") {
        const allowed = user.role === "admin" || user.permissions?.WasteRecord?.view;
        if (!allowed) return json(res,403,{error:"ไม่มีสิทธิ์ส่งออกข้อมูลของเสีย"});
        const rows = await readRows("WasteRecord"), headers=rows[0]||[], dateIdx=headerIndex(headers,["วันที่ผลิต","date","production date"]);
        const from=String(req.query?.from||""), to=String(req.query?.to||""), all=String(req.query?.all||"")==="true";
        if(!all&&!from&&!to)return json(res,400,{error:"เลือกช่วงวันที่หรือเลือกส่งออกทั้งหมดก่อน"});
        if(from&&to&&from>to)return json(res,400,{error:"วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด"});
        if(!all&&dateIdx<0)return json(res,400,{error:"ไม่พบคอลัมน์วันที่ผลิตในชีต WasteRecord"});
        const data=rows.slice(1).filter(row=>{if(all||dateIdx<0||(!from&&!to))return true;const date=csvDate(row[dateIdx]);return (!from||date>=from)&&(!to||date<=to);}).map(row=>row.filter((_,i)=>i!==1));
        return json(res,200,{headers:headers.filter((_,i)=>i!==1),rows:data});
      }
      return json(res,400,{error:"ไม่รองรับคำขอนี้"});
    }
    if (req.method !== "POST") return json(res,405,{error:"Method not allowed"});
    const action=String(req.body?.action||"");
    if (action === "create-user") {
      if(user.role!=="admin")return json(res,403,{error:"เฉพาะ Admin เท่านั้น"});
      const userId=String(req.body?.userId||"").trim(), password=String(req.body?.password||"");
      if (!/^[\p{L}\p{N}._-]{3,40}$/u.test(userId)) return json(res,400,{error:"User ID ต้องยาว 3–40 ตัว และใช้ตัวอักษร ตัวเลข . _ - ได้"});
      if(password.length<6)return json(res,400,{error:"รหัสผ่านชั่วคราวต้องมีอย่างน้อย 6 ตัวอักษร"});
      const users=await allUsers(); if(users.some(entry=>String(entry.UserID).toLocaleLowerCase()===userId.toLocaleLowerCase()))return json(res,409,{error:"มี User ID นี้แล้ว"});
      const permissions={...defaultPermissions,...(req.body?.permissions||{})};
      await addUser({UserID:userId,PasswordHash:hashPassword(password),Role:"user",Permissions:permissions,Active:true,MustChangePassword:true,CreatedAt:new Date().toISOString()});
      return json(res,201,{ok:true});
    }
    if (action === "update-user") {
      if(user.role!=="admin")return json(res,403,{error:"เฉพาะ Admin เท่านั้น"});
      const users=await allUsers(), target=users.find(entry=>String(entry.UserID).toLocaleLowerCase()===String(req.body?.userId||"").toLocaleLowerCase());
      if(!target)return json(res,404,{error:"ไม่พบบัญชีผู้ใช้"});
      if(String(target.Role).toLowerCase()==="admin")return json(res,400,{error:"ไม่สามารถแก้สิทธิ์บัญชี Admin ผ่านหน้านี้"});
      target.Active=Boolean(req.body?.active); target.Permissions={...defaultPermissions,...(req.body?.permissions||{})};
      await updateUserRows(users); return json(res,200,{ok:true});
    }
    if (action === "reset-password") {
      if(user.role!=="admin")return json(res,403,{error:"เฉพาะ Admin เท่านั้น"});
      const password=String(req.body?.password||""); if(password.length<6)return json(res,400,{error:"รหัสผ่านชั่วคราวต้องมีอย่างน้อย 6 ตัวอักษร"});
      const users=await allUsers(), target=users.find(entry=>String(entry.UserID).toLocaleLowerCase()===String(req.body?.userId||"").toLocaleLowerCase());
      if(!target)return json(res,404,{error:"ไม่พบบัญชีผู้ใช้"});
      target.PasswordHash=hashPassword(password); target.MustChangePassword=true; await updateUserRows(users); return json(res,200,{ok:true});
    }
    if (action === "preview-import" || action === "import") {
      const tab=String(req.body?.tab||""), mode=req.body?.mode==="append"?"append":"replace";
      if(!tabs.includes(tab))return json(res,400,{error:"ไม่พบชีตที่เลือก"});
      if(user.role!=="admin"&&!user.permissions?.[tab]?.edit)return json(res,403,{error:"ไม่มีสิทธิ์แก้ไขชีตนี้"});
      const data=await loadExisting(), existing=data[tab], headers=req.body?.headers, rows=req.body?.rows;
      const report=inspectImport(tab,headers,rows,mode==="append"?existing: [existing[0]||[]]);
      if(action==="preview-import")return json(res,200,{report,rowCount:Array.isArray(rows)?rows.length:0});
      if(!report.valid)return json(res,400,{error:"พบข้อผิดพลาด ต้องแก้ก่อนนำเข้า",report});
      if(report.warnings.length&&!req.body?.acceptWarnings)return json(res,409,{error:"มีรายการเตือน ต้องยืนยันก่อนนำเข้า",report});
      if(mode==="append")await writeRows(tab,[headers,...rows]); else await replaceRows(tab,[headers,...rows]);
      return json(res,200,{ok:true,imported:rows.length,report});
    }
    return json(res,400,{error:"ไม่รองรับคำขอนี้"});
  } catch(error) { return json(res,500,{error:error.message||"จัดการข้อมูลระบบไม่สำเร็จ"}); }
}

