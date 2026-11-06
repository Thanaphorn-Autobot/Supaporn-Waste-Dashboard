const SHEET_ID = "1Oh4I2T-GyDrMHYwCiCrVGlJLUH1kwqwo8Jgs1Z9tDDM";
const TAB = "WasteRecord";

const excluded = new Set([
  "วันที่ผลิต", "date", "production date", "partid", "part no", "part name",
  "po no", "จำนวนสั่งผลิต", "จำนวนผลิต", "ค้างผลิต", "ng", "% ng", "remark", "m/c no",
]);

function clean(value) {
  return String(value ?? "").trim().toLocaleLowerCase("th").replace(/\s+/g, " ");
}

function dateValue(value, formatted) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000) {
    const serial = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return serial.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const m = value.match(/^Date\((\d+),(\d+),(\d+).*\)$/);
    if (m) return `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const parsed = new Date(formatted || value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const source = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(TAB)}`;
    const response = await fetch(source, { headers: { Accept: "application/json,text/plain,*/*" } });
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
    const text = await response.text();
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    if (start < 0 || end <= start) throw new Error("Google Sheets did not return a readable table");
    const payload = JSON.parse(text.slice(start + 1, end));
    const table = payload.table;
    if (!table?.cols || !table?.rows) throw new Error("The WasteRecord tab was not found or has no rows");

    const labels = table.cols.map((col, i) => clean(col.label || col.id || `column ${i + 1}`));
    const findCol = (...needles) => labels.findIndex(label => needles.some(needle => label === clean(needle)));
    const dateIndex = findCol("วันที่ผลิต", "date", "production date");
    const partNoIndex = findCol("part no", "partno", "รหัสชิ้นงาน");
    const partNameIndex = findCol("part name", "partname", "ชื่อชิ้นงาน");
    const producedIndex = findCol("จำนวนผลิต", "produced qty", "produced");
    const ngIndex = findCol("ng", "จำนวน ng");
    const partIdIndex = findCol("partid");
    if ([dateIndex, partNoIndex, producedIndex, ngIndex].some(i => i < 0)) {
      throw new Error("Missing required columns: วันที่ผลิต, Part No, จำนวนผลิต, NG");
    }

    const defectIndexes = labels.map((label, i) => ({ label: table.cols[i].label || label, key: label, i }))
      .filter(col => !excluded.has(col.key) && col.i !== partIdIndex);
    const records = table.rows.map(row => {
      const cells = row.c || [];
      const value = i => cells[i]?.v ?? null;
      const number = i => { const n = Number(value(i)); return Number.isFinite(n) ? n : 0; };
      const defects = {};
      for (const col of defectIndexes) {
        const count = number(col.i);
        if (count > 0) defects[col.label] = count;
      }
      return {
        date: dateValue(value(dateIndex), cells[dateIndex]?.f),
        partNo: String(value(partNoIndex) ?? "").trim(),
        partName: String(value(partNameIndex) ?? "").trim(),
        produced: number(producedIndex),
        ng: number(ngIndex),
        defects,
        partIdMissing: partIdIndex >= 0 && /^#(N\/A|REF!|VALUE!)/i.test(String(value(partIdIndex) ?? "")),
      };
    }).filter(r => r.date && (r.partNo || r.produced || r.ng));

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ records, unresolvedPartIds: records.filter(r => r.partIdMissing).length, refreshedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(502).json({ error: "Unable to read the Google Sheet. Check that the WasteRecord tab is viewable by the Vercel function.", detail: error.message });
  }
}

