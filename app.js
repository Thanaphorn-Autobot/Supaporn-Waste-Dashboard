const $ = selector => document.querySelector(selector);
const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { records: [], unresolved: 0 };
const monthNames = new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" });

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}

function getFiltered() {
  const from = $("#from-date").value;
  const to = $("#to-date").value;
  const part = $("#part-filter").value;
  return state.records.filter(r => (!from || r.date >= from) && (!to || r.date <= to) && (!part || r.partNo === part));
}

function render() {
  const rows = getFiltered();
  const produced = rows.reduce((sum, r) => sum + r.produced, 0);
  const ng = rows.reduce((sum, r) => sum + r.ng, 0);
  const rate = produced ? ng / produced * 100 : 0;
  $("#kpi-produced").textContent = nf.format(produced);
  $("#kpi-ng").textContent = nf.format(ng);
  $("#kpi-rate").textContent = `${pf.format(rate)}%`;
  $("#kpi-records").textContent = nf.format(rows.length);
  $("#kpi-ng-detail").textContent = `${produced ? pf.format(ng / produced * 100) : "0.00"}% ของจำนวนผลิต`;
  $("#range-label").textContent = rows.length ? `${nf.format(rows.length)} รายการ` : "ไม่มีข้อมูลในช่วงนี้";
  $("#trend-range").textContent = rows.length ? `${shortDate(rows.map(r => r.date).sort()[0])} — ${shortDate(rows.map(r => r.date).sort().at(-1))}` : "";
  renderTrend(rows);
  renderDefects(rows);
  renderParts(rows, ng);
}

function renderTrend(rows) {
  const host = $("#trend-chart");
  const byMonth = new Map();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const v = byMonth.get(key) || { produced: 0, ng: 0 };
    v.produced += r.produced; v.ng += r.ng; byMonth.set(key, v);
  }
  const data = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, rate: v.produced ? v.ng / v.produced * 100 : 0 }));
  if (!data.length) { host.innerHTML = '<div class="loading">ไม่มีข้อมูลในช่วงที่เลือก</div>'; return; }
  const width = 720, height = 220, left = 39, right = 10, top = 12, bottom = 33;
  const max = Math.max(1, ...data.map(d => d.rate)) * 1.2;
  const x = i => left + (data.length === 1 ? (width - left - right) / 2 : i * (width - left - right) / (data.length - 1));
  const y = v => top + (height - top - bottom) * (1 - v / max);
  const ticks = 4;
  let grid = "";
  for (let i = 0; i <= ticks; i++) {
    const value = max * i / ticks, yy = y(value);
    grid += `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#edf1ed"/><text x="${left-8}" y="${yy+3}" text-anchor="end" fill="#97a19b" font-size="9">${pf.format(value)}%</text>`;
  }
  const points = data.map((d,i) => `${x(i)},${y(d.rate)}`).join(" ");
  const area = `${x(0)},${height-bottom} ${points} ${x(data.length-1)},${height-bottom}`;
  const step = Math.max(1, Math.ceil(data.length / 8));
  const labels = data.map((d,i) => i % step === 0 || i === data.length-1 ? `<text x="${x(i)}" y="${height-9}" text-anchor="middle" fill="#8e9992" font-size="9">${escapeHTML(monthNames.format(new Date(Number(d.key.slice(0,4)), Number(d.key.slice(5,7))-1, 1)))}</text>` : "").join("");
  const dots = data.map((d,i) => `<circle cx="${x(i)}" cy="${y(d.rate)}" r="3.3" fill="#fff" stroke="#23856b" stroke-width="2"><title>${escapeHTML(d.key)}: ${pf.format(d.rate)}%</title></circle>`).join("");
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="แนวโน้มอัตราของเสียรายเดือน">${grid}<polygon points="${area}" fill="#e9f3ed" opacity=".8"/><polyline points="${points}" fill="none" stroke="#218268" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function renderDefects(rows) {
  const total = {};
  for (const r of rows) for (const [name, count] of Object.entries(r.defects)) total[name] = (total[name] || 0) + count;
  const top = Object.entries(total).sort((a,b) => b[1]-a[1]).slice(0, 7);
  const max = top[0]?.[1] || 1;
  $("#defect-chart").innerHTML = top.length ? top.map(([name,count]) => `<div class="bar-row"><span class="bar-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(1,count/max*100)}%"></span></span><span class="bar-value">${nf.format(count)}</span></div>`).join("") : '<div class="loading">ไม่มีข้อมูลประเภทของเสีย</div>';
}

function renderParts(rows, totalNg) {
  const parts = new Map();
  for (const r of rows) {
    const key = r.partNo || "ไม่ระบุ Part No";
    const p = parts.get(key) || { partNo: key, partName: r.partName, produced: 0, ng: 0 };
    p.produced += r.produced; p.ng += r.ng;
    if (!p.partName && r.partName) p.partName = r.partName;
    parts.set(key, p);
  }
  const top = [...parts.values()].sort((a,b) => b.ng-a.ng).slice(0, 10);
  const max = top[0]?.ng || 1;
  $("#part-table").innerHTML = top.length ? top.map((p,i) => `<tr><td class="rank">${String(i+1).padStart(2,"0")}</td><td class="part-code">${escapeHTML(p.partNo)}</td><td class="part-name" title="${escapeHTML(p.partName)}">${escapeHTML(p.partName || "—")}</td><td class="number">${nf.format(p.produced)}</td><td class="number">${nf.format(p.ng)}</td><td class="number rate-cell">${p.produced ? pf.format(p.ng/p.produced*100) : "0.00"}%</td><td><span class="share-track"><span class="share-fill" style="display:block;width:${p.ng/max*100}%"></span></span><span class="share-label">${totalNg ? pf.format(p.ng/totalNg*100) : "0.00"}%</span></td></tr>`).join("") : '<tr><td colspan="7" class="loading">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>';
}

async function loadData() {
  $("#error-state").hidden = true;
  $("#refresh").disabled = true;
  $("#refresh").textContent = "กำลังโหลด…";
  try {
    const response = await fetch("/api/waste", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "ไม่สามารถเชื่อมต่อข้อมูลได้");
    state.records = payload.records || [];
    state.unresolved = payload.unresolvedPartIds || 0;
    if (!state.records.length) throw new Error("ไม่พบรายการในแท็บ WasteRecord");
    const dates = state.records.map(r => r.date).sort();
    $("#from-date").min = dates[0]; $("#from-date").max = dates.at(-1);
    $("#to-date").min = dates[0]; $("#to-date").max = dates.at(-1);
    const parts = new Map(state.records.map(r => [r.partNo, r.partName]));
    $("#part-filter").innerHTML = '<option value="">ทุกชิ้นงาน</option>' + [...parts.entries()].filter(([no]) => no).sort(([a],[b]) => a.localeCompare(b)).map(([no,name]) => `<option value="${escapeHTML(no)}">${escapeHTML(no)}${name ? ` — ${escapeHTML(name)}` : ""}</option>`).join("");
    $("#updated-at").textContent = `อัปเดต ${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(payload.refreshedAt || Date.now()))}`;
    $("#data-warning").hidden = !state.unresolved;
    if (state.unresolved) $("#data-warning").textContent = `พบ ${nf.format(state.unresolved)} รายการที่ PartID เป็น #N/A; Dashboard สรุปด้วย Part No จากบันทึกการผลิต`;
    render();
  } catch (error) {
    $("#error-state").hidden = false;
    $("#error-message").textContent = error.message;
  } finally {
    $("#refresh").disabled = false;
    $("#refresh").innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 9a6.5 6.5 0 0 0-11.2-3L3.5 8M3.5 4.5V8H7M3.5 11a6.5 6.5 0 0 0 11.2 3l1.8-2M16.5 15.5V12H13"/></svg> รีเฟรชข้อมูล';
  }
}

$("#from-date").addEventListener("change", render);
$("#to-date").addEventListener("change", render);
$("#part-filter").addEventListener("change", render);
$("#clear-filter").addEventListener("click", () => { $("#from-date").value = ""; $("#to-date").value = ""; $("#part-filter").value = ""; render(); });
$("#refresh").addEventListener("click", loadData);
$("#retry").addEventListener("click", loadData);
loadData();
