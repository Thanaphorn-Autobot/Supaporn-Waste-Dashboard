const SHEET_ID = "1Oh4I2T-GyDrMHYwCiCrVGlJLUH1kwqwo8Jgs1Z9tDDM";
const excluded = new Set(["วันที่ผลิต", "date", "production date", "partid", "part no", "partname", "part name", "po no", "จำนวนสั่งผลิต", "จำนวนผลิต", "ค้างผลิต", "ng", "% ng", "remark", "m/c no"]);
const clean = value => String(value ?? "").trim().toLocaleLowerCase("th").replace(/\s+/g, " ");

function dateValue(value) {
  if (typeof value === "string") {
    const m = value.match(/^Date\((\d+),(\d+),(\d+).*\)$/);
    if (m) return m[1] + "-" + String(Number(m[2]) + 1).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0");
    const local = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (local) return local[1] + "-" + local[2].padStart(2, "0") + "-" + local[3].padStart(2, "0");
  }
  if (typeof value === "number" && value > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

async function readTab(tab) {
  const url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json&sheet=" + encodeURIComponent(tab);
  const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });
  if (!response.ok) throw new Error("Google Sheets (" + tab + ") returned " + response.status);
  const text = await response.text(), start = text.indexOf("("), end = text.lastIndexOf(")");
  if (start < 0 || end <= start) throw new Error("Google Sheets tab " + tab + " did not return a readable table");
  const table = JSON.parse(text.slice(start + 1, end)).table;
  if (!table?.cols || !table?.rows) throw new Error("The " + tab + " tab was not found or has no rows");
  const labels = table.cols.map((col, i) => clean(col.label || col.id || "column " + (i + 1)));
  return table.rows.map(row => Object.fromEntries(labels.map((label, i) => [label, row.c?.[i]?.v ?? null]).filter(pair => pair[1] !== null)));
}
function pick(row, ...names) {
  for (const name of names) if (row[clean(name)] != null) return row[clean(name)];
  return "";
}
function numeric(value) {
  const n = Number(String(value ?? "").replace(/[% ,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const [wasteRows, partRows, mappingRows] = await Promise.all([readTab("WasteRecord"), readTab("Part"), readTab("Part.Materials")]);
    const partsById = new Map();
    for (const row of partRows) {
      const id = String(pick(row, "PartID")).trim();
      if (id) partsById.set(id, {
        partName: String(pick(row, "Part Name")).trim(),
        partSubNo: String(pick(row, "Part Sub No")).trim(),
        partSubName: String(pick(row, "Part Sub Name")).trim(),
        partWeight: numeric(pick(row, "Part (g)")),
      });
    }
    const materialNames = new Map(), mixByPart = new Map();
    for (const row of mappingRows) {
      const materialId = String(pick(row, "MaterialID")).trim();
      const materialName = String(pick(row, "Mat'l Name", "Material Name", "Mat'l No")).trim();
      if (materialId && materialName) materialNames.set(materialId, materialName);
      const partId = String(pick(row, "PartID")).trim(), ratio = numeric(pick(row, "Ratio"));
      if (!partId || !materialId || ratio <= 0) continue;
      const mix = mixByPart.get(partId) || new Map();
      mix.set(materialId, (mix.get(materialId) || 0) + ratio);
      mixByPart.set(partId, mix);
    }
    const labels = Object.keys(wasteRows[0] || {});
    const find = (...names) => names.map(clean).find(key => labels.includes(key));
    const dateKey = find("วันที่ผลิต", "date", "production date");
    const partNoKey = find("part no", "partno", "รหัสชิ้นงาน");
    const partNameKey = find("part name", "partname", "ชื่อชิ้นงาน");
    const producedKey = find("จำนวนผลิต", "produced qty", "produced");
    const ngKey = find("ng", "จำนวน ng"), partIdKey = clean("PartID");
    if ([dateKey, partNoKey, producedKey, ngKey].some(key => !key)) throw new Error("Missing required columns: วันที่ผลิต, Part No, จำนวนผลิต, NG");

    const records = wasteRows.map(row => {
      const partId = String(row[partIdKey] ?? "").trim(), part = partsById.get(partId) || {};
      const defects = {};
      for (const [key, value] of Object.entries(row)) {
        if (!excluded.has(key) && key !== partIdKey) {
          const count = numeric(value);
          if (count > 0) defects[key] = count;
        }
      }
      const ng = numeric(row[ngKey]), mix = mixByPart.get(partId);
      const totalRatio = mix ? [...mix.values()].reduce((sum, ratio) => sum + ratio, 0) : 0;
      const materialWasteKg = {};
      if (mix && totalRatio > 0 && ng > 0) {
        const grams = numeric(part.partWeight);
        for (const [id, ratio] of mix) materialWasteKg[materialNames.get(id) || id] = ng * grams * ratio / totalRatio / 1000;
      }
      return {
        date: dateValue(row[dateKey]), partId, partNo: String(row[partNoKey] ?? "").trim(),
        partName: String(row[partNameKey] ?? part.partName ?? "").trim(),
        partSubNo: String(part.partSubNo ?? "").trim(), partSubName: String(part.partSubName ?? "").trim(),
        produced: numeric(row[producedKey]), ng, defects, materialWasteKg,
        partIdMissing: /^#(N\/A|REF!|VALUE!)/i.test(partId),
      };
    }).filter(record => record.date && (record.partNo || record.produced || record.ng));

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    if (req.query?.view === "records") {
      const query = String(req.query.q || "").trim().toLocaleLowerCase("th");
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const offset = Math.max(0, Number.parseInt(req.query.offset || "0", 10) || 0);
      const filtered = records.filter(record => {
        const searchable = [record.partNo, record.partName, record.partSubNo, record.partSubName, ...Object.keys(record.defects)].join(" ").toLocaleLowerCase("th");
        return (!from || record.date >= from) && (!to || record.date <= to) && (!query || searchable.includes(query));
      }).sort((a, b) => b.date.localeCompare(a.date));
      return res.status(200).json({ records: filtered.slice(offset, offset + 100), total: filtered.length, offset, pageSize: 100, refreshedAt: new Date().toISOString() });
    }
    return res.status(200).json({ records, unresolvedPartIds: records.filter(record => record.partIdMissing).length, refreshedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(502).json({ error: "Unable to read the Google Sheet. Check that its data tabs are viewable by the Vercel function.", detail: error.message });
  }
}
