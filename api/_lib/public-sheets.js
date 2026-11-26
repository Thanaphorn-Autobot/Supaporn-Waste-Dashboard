const spreadsheetId = process.env.GOOGLE_SHEETS_ID || "1Oh4I2T-GyDrMHYwCiCrVGlJLUH1kwqwo8Jgs1Z9tDDM";

export async function readPublicRows(tab) {
  const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/gviz/tq?tqx=out:json&sheet=" + encodeURIComponent(tab);
  const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });
  if (!response.ok) throw new Error("Google Sheets (" + tab + ") returned " + response.status);
  const text = await response.text(), start = text.indexOf("("), end = text.lastIndexOf(")");
  if (start < 0 || end <= start) throw new Error("Google Sheets tab " + tab + " did not return a readable table");
  const table = JSON.parse(text.slice(start + 1, end)).table;
  if (!table?.cols || !table?.rows) throw new Error("The " + tab + " tab was not found or has no rows");
  const headers = table.cols.map((col,i)=>col.label || col.id || "column " + (i+1));
  const rows = table.rows.map(row=>headers.map((_,i)=>row.c?.[i]?.v ?? ""));
  return [headers,...rows];
}

