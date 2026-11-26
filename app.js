const $ = selector => document.querySelector(selector);
const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });
const kgf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { records: [], unresolved: 0, appliedFrom: "", appliedTo: "", partQuery: "", materialFilter: "", openPartDetail: null, recordRows: [], recordTotal: 0, recordOffset: 0, recordsLoaded: false, recordsBusy: false, user: null, pendingPage: "system-page", importData: null, importReport: null, databaseRows: [] };
const monthNames = new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" });

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shortDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}
function partText(r) {
  return [r.partNo, r.partName, r.partSubNo, r.partSubName].join(" ").toLocaleLowerCase("th");
}
function getBaseFiltered() {
  return state.records.filter(r => (!state.appliedFrom || r.date >= state.appliedFrom) && (!state.appliedTo || r.date <= state.appliedTo) && (!state.partQuery || partText(r).includes(state.partQuery)));
}
function getFiltered() {
  const rows = getBaseFiltered();
  return rows.filter(r => (!state.materialFilter || Object.prototype.hasOwnProperty.call(r.materialWasteKg || {}, state.materialFilter)));
}
function updateMaterialOptions(rows) {
  const materials = [...new Set(rows.flatMap(r => Object.keys(r.materialWasteKg || {})))].sort((a,b)=>a.localeCompare(b,"th"));
  if (state.materialFilter && !materials.includes(state.materialFilter)) state.materialFilter = "";
  $("#material-filter").innerHTML = '<option value="">ทุกวัสดุ</option>' + materials.map(name=>'<option value="' + escapeHTML(name) + '">' + escapeHTML(name) + '</option>').join("");
  $("#material-filter").value = state.materialFilter;
}
function render() {
  const rows = getFiltered();
  const produced = rows.reduce((sum, r) => sum + r.produced, 0), ng = rows.reduce((sum, r) => sum + r.ng, 0);
  $("#kpi-produced").textContent = nf.format(produced);
  $("#kpi-ng").textContent = nf.format(ng);
  $("#kpi-rate").textContent = (produced ? pf.format(ng / produced * 100) : "0.00") + "%";
  $("#kpi-records").textContent = nf.format(rows.length);
  $("#kpi-ng-detail").textContent = (produced ? pf.format(ng / produced * 100) : "0.00") + "% ของจำนวนผลิต";
  $("#range-label").textContent = rows.length ? nf.format(rows.length) + " รายการ" : "ไม่มีข้อมูลในช่วงนี้";
  const dates = rows.map(r => r.date).sort();
  $("#trend-range").textContent = dates.length ? shortDate(dates[0]) + " — " + shortDate(dates.at(-1)) : "";
  renderTrend(rows); renderDefects(rows); renderHeatmap(rows); renderParts(rows); renderMaterials(rows, state.materialFilter);
}
function renderTrend(rows) {
  const host = $("#trend-chart"), byMonth = new Map();
  for (const r of rows) {
    const key = r.date.slice(0, 7), v = byMonth.get(key) || { produced: 0, ng: 0 };
    v.produced += r.produced; v.ng += r.ng; byMonth.set(key, v);
  }
  const data = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, rate: v.produced ? v.ng / v.produced * 100 : 0 }));
  if (!data.length) { host.innerHTML = '<div class="loading">ไม่มีข้อมูลในช่วงที่เลือก</div>'; return; }
  const width = 720, height = 220, left = 39, right = 10, top = 12, bottom = 33;
  const max = Math.max(1, ...data.map(d => d.rate)) * 1.2;
  const x = i => left + (data.length === 1 ? (width - left - right) / 2 : i * (width - left - right) / (data.length - 1));
  const y = v => top + (height - top - bottom) * (1 - v / max);
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4, yy = y(value);
    grid += '<line x1="' + left + '" y1="' + yy + '" x2="' + (width-right) + '" y2="' + yy + '" stroke="#edf1ed"/><text x="' + (left-8) + '" y="' + (yy+3) + '" text-anchor="end" fill="#97a19b" font-size="9">' + pf.format(value) + '%</text>';
  }
  const points = data.map((d,i) => x(i) + "," + y(d.rate)).join(" ");
  const area = x(0) + "," + (height-bottom) + " " + points + " " + x(data.length-1) + "," + (height-bottom);
  const step = Math.max(1, Math.ceil(data.length / 8));
  const labels = data.map((d,i) => i % step === 0 || i === data.length-1 ? '<text x="' + x(i) + '" y="' + (height-9) + '" text-anchor="middle" fill="#8e9992" font-size="9">' + escapeHTML(monthNames.format(new Date(Number(d.key.slice(0,4)), Number(d.key.slice(5,7))-1, 1))) + '</text>' : "").join("");
  const dots = data.map((d,i) => '<circle cx="' + x(i) + '" cy="' + y(d.rate) + '" r="3.3" fill="#fff" stroke="#23856b" stroke-width="2"><title>' + escapeHTML(d.key) + ": " + pf.format(d.rate) + '%</title></circle>').join("");
  host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="แนวโน้มอัตราของเสียรายเดือน">' + grid + '<polygon points="' + area + '" fill="#e9f3ed" opacity=".8"/><polyline points="' + points + '" fill="none" stroke="#218268" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' + dots + labels + '</svg>';
}
function renderDefects(rows) {
  const total = {};
  for (const r of rows) for (const [name, count] of Object.entries(r.defects || {})) total[name] = (total[name] || 0) + count;
  const top = Object.entries(total).sort((a,b) => b[1]-a[1]).slice(0, 7), max = top[0]?.[1] || 1;
  $("#defect-chart").innerHTML = top.length ? top.map(([name,count]) => '<div class="bar-row"><span class="bar-name" title="' + escapeHTML(name) + '">' + escapeHTML(name) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2,count/max*100) + '%"></span></span><span class="bar-value">' + nf.format(count) + '</span></div>').join("") : '<div class="loading">ไม่มีข้อมูลประเภทของเสีย</div>';
}
function renderHeatmap(rows) {
  const machineTotals = new Map(), defectTotals = new Map(), counts = new Map();
  for (const r of rows) {
    const machine = String(r.machineNo || "").trim() || "ไม่ระบุ";
    if (!machineTotals.has(machine)) machineTotals.set(machine, 0);
    for (const [defect, rawCount] of Object.entries(r.defects || {})) {
      const count = Number(rawCount) || 0;
      if (count <= 0) continue;
      const key = machine + "\u0000" + defect;
      counts.set(key, (counts.get(key) || 0) + count);
      machineTotals.set(machine, machineTotals.get(machine) + count);
      defectTotals.set(defect, (defectTotals.get(defect) || 0) + count);
    }
  }
  const machines = [...machineTotals.keys()].sort((a,b) => a === "ไม่ระบุ" ? 1 : b === "ไม่ระบุ" ? -1 : a.localeCompare(b,"th",{numeric:true}));
  const defects = [...defectTotals.keys()].sort((a,b) => defectTotals.get(b)-defectTotals.get(a));
  const max = Math.max(1, ...counts.values());
  const host = $("#machine-defect-heatmap");
  if (!machines.length || !defects.length) {
    host.innerHTML = '<div class="loading">ไม่มีข้อมูล M/C No หรือประเภทของเสียในช่วงที่เลือก</div>';
    return;
  }
  const head = '<thead><tr><th class="heatmap-machine">M/C No</th>' + defects.map(name=>'<th title="' + escapeHTML(name) + '">' + escapeHTML(name) + '</th>').join("") + '</tr></thead>';
  const body = machines.map(machine => '<tr><th class="heatmap-machine" scope="row">' + escapeHTML(machine) + '</th>' + defects.map(defect=>{
    const value = counts.get(machine + "\u0000" + defect) || 0;
    const intensity = value ? Math.sqrt(value / max) : 0;
    const background = value ? 'rgba(43,148,119,' + (0.12 + intensity * 0.76).toFixed(2) + ')' : '#f6f8f6';
    const color = intensity > 0.68 ? '#fff' : '#52665c';
    return '<td title="' + escapeHTML(machine + " · " + defect + ": " + nf.format(value) + " ชิ้น") + '" style="background:' + background + ';color:' + color + '">' + (value ? nf.format(value) : '—') + '</td>';
  }).join("") + '</tr>').join("");
  host.innerHTML = '<div class="heatmap-scroll"><table class="heatmap-table">' + head + '<tbody>' + body + '</tbody></table></div>';
}
function renderParts(rows) {
  const parts = new Map();
  for (const r of rows) {
    const partNo = r.partNo || r.partId || "ไม่ระบุ Part No", partSubNo = r.partSubNo || "ไม่ระบุ Part Sub No";
    const key = encodeURIComponent(JSON.stringify([partNo,partSubNo]));
    const p = parts.get(key) || { key, partNo: r.partNo, partName: r.partName, partSubNo: r.partSubNo, partSubName: r.partSubName, produced: 0, ng: 0 };
    p.produced += r.produced; p.ng += r.ng; parts.set(key, p);
  }
  const top = [...parts.values()].sort((a,b) => b.ng-a.ng).slice(0, 10);
  $("#part-table").innerHTML = top.length ? top.map((p,i) => '<tr><td class="rank">' + String(i+1).padStart(2,"0") + '</td><td class="part-code">' + escapeHTML(p.partNo || "—") + '</td><td class="part-name" title="' + escapeHTML(p.partName) + '">' + escapeHTML(p.partName || "—") + (p.partSubNo ? '<small class="subline">' + escapeHTML(p.partSubNo) + (p.partSubName ? " · " + escapeHTML(p.partSubName) : "") + '</small>' : "") + '</td><td class="number">' + nf.format(p.produced) + '</td><td class="number">' + nf.format(p.ng) + '</td><td class="number rate-cell">' + (p.produced ? pf.format(p.ng/p.produced*100) : "0.00") + '%</td><td><button class="text-action" data-part-detail="' + escapeHTML(p.key) + '">รายละเอียด</button></td></tr>').join("") : '<tr><td colspan="7" class="loading">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>';
}
function renderMaterials(rows, selectedMaterial) {
  const total = {};
  for (const r of rows) for (const [name, kg] of Object.entries(r.materialWasteKg || {})) if (!selectedMaterial || name === selectedMaterial) total[name] = (total[name] || 0) + kg;
  const items = Object.entries(total).filter(([,kg]) => kg > 0).sort((a,b) => b[1]-a[1]), max = items[0]?.[1] || 1;
  $("#material-chart").innerHTML = items.length ? items.map(([name,kg]) => '<div class="bar-row"><span class="bar-name" title="' + escapeHTML(name) + '">' + escapeHTML(name) + '</span><span class="bar-track"><span class="bar-fill material-fill" style="width:' + Math.max(2,kg/max*100) + '%"></span></span><span class="bar-value">' + kgf.format(kg) + '</span></div>').join("") : '<div class="loading">ไม่มีข้อมูลวัสดุที่คำนวณได้</div>';
}
function renderRecords() {
  const rows = state.recordRows;
  $("#record-count").textContent = nf.format(state.recordTotal) + " รายการ";
  $("#page-summary").textContent = state.recordsBusy ? "กำลังค้นหา…" : state.recordTotal ? "แสดง " + nf.format(state.recordOffset + 1) + "–" + nf.format(Math.min(state.recordOffset + rows.length, state.recordTotal)) + " จาก " + nf.format(state.recordTotal) + " รายการ" : "ไม่พบรายการที่ตรงกับเงื่อนไข";
  $("#records-prev").disabled = state.recordsBusy || state.recordOffset <= 0;
  $("#records-next").disabled = state.recordsBusy || state.recordOffset + rows.length >= state.recordTotal;
  $("#records-table").innerHTML = rows.length ? rows.map((r,index) => '<tr><td>' + shortDate(r.date) + '</td><td class="part-code">' + escapeHTML(r.partNo || "—") + '</td><td class="part-name">' + escapeHTML(r.partName || "—") + '</td><td>' + escapeHTML(r.partSubNo || "—") + '</td><td class="part-name">' + escapeHTML(r.partSubName || "—") + '</td><td class="number">' + nf.format(r.produced) + '</td><td class="number">' + nf.format(r.ng) + '</td><td class="number rate-cell">' + (r.produced ? pf.format(r.ng/r.produced*100) : "0.00") + '%</td><td><button class="text-action" data-record-detail="' + index + '">รายละเอียด</button></td></tr>').join("") : '<tr><td colspan="9" class="loading">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>';
}
async function loadRecordPage(offset = 0) {
  state.recordsBusy = true; renderRecords();
  const params = new URLSearchParams({ view: "records", q: $("#record-search").value.trim(), from: $("#records-from").value, to: $("#records-to").value, offset: String(offset) });
  try {
    const response = await fetch("/api/waste?" + params.toString(), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "ไม่สามารถค้นหารายการได้");
    state.recordRows = payload.records || []; state.recordTotal = payload.total || 0; state.recordOffset = payload.offset || 0; state.recordsLoaded = true;
  } catch (error) {
    state.recordRows = []; state.recordTotal = 0; $("#page-summary").textContent = error.message;
  } finally {
    state.recordsBusy = false; renderRecords();
  }
}
function showDialog(html) {
  $("#detail-content").innerHTML = html;
  $("#detail-dialog").showModal();
}
function renderMiniBars(defects, produced) {
  const items = Object.entries(defects || {}).sort((a,b)=>b[1]-a[1]), max = items[0]?.[1] || 1;
  return items.length ? '<div class="detail-bars">' + items.map(([name,count])=>'<div class="bar-row"><span class="bar-name">' + escapeHTML(name) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2,count/max*100) + '%"></span></span><span class="bar-value">' + nf.format(count) + ' · ' + defectPercent(count,produced) + '</span></div>').join("") + '</div>' : '<p class="empty-note">ไม่มีข้อมูลสาเหตุของเสีย</p>';
}
function defectPercent(count, produced) { return produced ? pf.format(count / produced * 100) + '%' : '0.00%'; }
function showRecord(index) {
  const r = state.recordRows[index]; if (!r) return;
  showDialog('<p class="panel-kicker">WASTE RECORD</p><h2>การ์ดรายการของเสีย</h2><p class="detail-date">' + shortDate(r.date) + '</p><div class="detail-metrics"><div><small>Part No</small><strong>' + escapeHTML(r.partNo || "—") + '</strong></div><div><small>Part Name</small><strong>' + escapeHTML(r.partName || "—") + '</strong></div><div><small>Part Sub No</small><strong>' + escapeHTML(r.partSubNo || "—") + '</strong></div><div><small>Part Sub Name</small><strong>' + escapeHTML(r.partSubName || "—") + '</strong></div><div><small>PO No</small><strong>' + escapeHTML(r.poNo || "—") + '</strong></div><div><small>M/C No</small><strong>' + escapeHTML(r.machineNo || "—") + '</strong></div><div><small>จำนวนผลิต</small><strong>' + nf.format(r.produced) + '</strong></div><div><small>NG</small><strong>' + nf.format(r.ng) + '</strong></div><div><small>%NG</small><strong>' + defectPercent(r.ng,r.produced) + '</strong></div></div><h3>สาเหตุของเสีย</h3>' + renderMiniBars(r.defects,r.produced));
}
function showPart(key) {
  let identity;
  try { identity = JSON.parse(decodeURIComponent(key)); } catch { return; }
  const [partNo,partSubNo] = identity;
  const rows = getFiltered().filter(r => (r.partNo || r.partId || "ไม่ระบุ Part No") === partNo && (r.partSubNo || "ไม่ระบุ Part Sub No") === partSubNo), p = rows[0];
  if (!p) return;
  state.openPartDetail = { p, rows };
  showDialog(renderPartDialog("graph"));
}
function renderPartDialog(view) {
  const { p, rows } = state.openPartDetail;
  const ng = rows.reduce((sum,r)=>sum+r.ng,0), produced = rows.reduce((sum,r)=>sum+r.produced,0), defects = {};
  for (const r of rows) for (const [name,count] of Object.entries(r.defects || {})) defects[name] = (defects[name] || 0) + count;
  const title = (p.partNo || "—") + " · " + (p.partName || "ไม่ระบุชื่อ");
  const subtitle = escapeHTML(p.partSubNo || "ไม่ระบุ Part Sub No") + (p.partSubName ? " · " + escapeHTML(p.partSubName) : "");
  const actions = view === "graph" ? '<div class="detail-view-actions"><button class="small-action" data-part-view="details" type="button">ดูข้อมูลชิ้นงาน</button></div>' : '<div class="detail-view-actions"><button class="small-action" data-part-view="graph" type="button">← กลับไปกราฟ</button></div>';
  if (view === "details") {
    const value = (n,suffix,format) => n === null || n === undefined || n === "" ? "—" : format.format(Number(n)) + suffix;
    const ratioFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });
    const materials = p.materials || [];
    const loss = p.lossPercent === null || p.lossPercent === undefined ? "—" : pf.format(Number(p.lossPercent) * 100) + "%";
    const materialTable = materials.length ? '<div class="table-scroll detail-material-scroll"><table class="detail-material-table"><thead><tr><th>Mat\'l No</th><th>Mat\'l Name</th><th class="number">Ratio</th></tr></thead><tbody>' + materials.map(m=>'<tr><td class="part-code">' + escapeHTML(m.materialNo || "—") + '</td><td>' + escapeHTML(m.materialName || "—") + '</td><td class="number">' + ratioFormat.format(Number(m.ratio) * 100) + '%</td></tr>').join("") + '</tbody></table></div>' : '<p class="empty-note">ไม่มีข้อมูลส่วนผสมวัสดุสำหรับ Part Sub นี้</p>';
    return '<p class="panel-kicker">PART WASTE DETAIL</p><h2>' + escapeHTML(title) + '</h2><p class="detail-date">' + subtitle + '</p>' + actions + '<h3>ข้อมูลชิ้นงาน</h3><div class="detail-metrics"><div><small>น้ำหนักชิ้นงาน</small><strong>' + value(p.partWeight," g",wf) + '</strong></div><div><small>น้ำหนัก Runner</small><strong>' + value(p.runnerWeight," g",wf) + '</strong></div><div><small>Loss</small><strong>' + loss + '</strong></div></div><h3>ส่วนผสมวัสดุ</h3>' + materialTable;
  }
  return '<p class="panel-kicker">PART WASTE DETAIL</p><h2>' + escapeHTML(title) + '</h2><p class="detail-date">' + subtitle + '</p><div class="detail-metrics"><div><small>รายการผลิต</small><strong>' + nf.format(rows.length) + '</strong></div><div><small>จำนวนผลิต</small><strong>' + nf.format(produced) + '</strong></div><div><small>NG รวม</small><strong>' + nf.format(ng) + '</strong></div><div><small>อัตรา NG</small><strong>' + (produced ? pf.format(ng/produced*100) : "0.00") + '%</strong></div></div>' + actions + '<h3>กราฟสาเหตุของเสีย</h3>' + renderMiniBars(defects,produced);
}
async function loadData() {
  $("#error-state").hidden = true; $("#refresh").disabled = true; $("#refresh").textContent = "กำลังโหลด…";
  try {
    const response = await fetch("/api/waste", { cache: "no-store" }), payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "ไม่สามารถเชื่อมต่อข้อมูลได้");
    state.records = payload.records || []; state.unresolved = payload.unresolvedPartIds || 0;
    if (!state.records.length) throw new Error("ไม่พบรายการในแท็บ WasteRecord");
    const dates = state.records.map(r=>r.date).sort();
    for (const id of ["from-date","records-from"]) { $( "#" + id).min = dates[0]; $("#" + id).max = dates.at(-1); }
    for (const id of ["to-date","records-to"]) { $("#" + id).min = dates[0]; $("#" + id).max = dates.at(-1); }
    const parts = new Map();
    for (const r of state.records) {
      const key = r.partNo || r.partId;
      if (key && !parts.has(key)) parts.set(key, [r.partNo,r.partName,r.partSubNo,r.partSubName].filter(Boolean).join(" — "));
    }
    $("#part-options").innerHTML = [...parts.entries()].map(([no,label])=>'<option value="' + escapeHTML(no) + '">' + escapeHTML(label) + '</option>').join("");
    updateMaterialOptions(getBaseFiltered());
    $("#updated-at").textContent = "อัปเดต " + new Intl.DateTimeFormat("th-TH",{hour:"2-digit",minute:"2-digit"}).format(new Date(payload.refreshedAt || Date.now()));
    $("#data-warning").hidden = !state.unresolved;
    if (state.unresolved) $("#data-warning").textContent = "พบ " + nf.format(state.unresolved) + " รายการที่ PartID เป็น #N/A; Dashboard สรุปด้วย Part No จากบันทึกการผลิต";
    render();
  } catch (error) {
    $("#error-state").hidden = false; $("#error-message").textContent = error.message;
  } finally {
    $("#refresh").disabled = false;
    $("#refresh").innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 9a6.5 6.5 0 0 0-11.2-3L3.5 8M3.5 4.5V8H7M3.5 11a6.5 6.5 0 0 0 11.2 3l1.8-2M16.5 15.5V12H13"/></svg> รีเฟรชข้อมูล';
  }
}
document.querySelectorAll(".nav-tab").forEach(button => button.addEventListener("click", () => openPage(button.dataset.page)));
function applyDashboardFilters() {
  state.appliedFrom = $("#from-date").value;
  state.appliedTo = $("#to-date").value;
  state.partQuery = $("#part-filter").value.trim().toLocaleLowerCase("th");
  state.materialFilter = $("#material-filter").value;
  updateMaterialOptions(getBaseFiltered());
  render();
}
$("#part-search-button").addEventListener("click", applyDashboardFilters);
$("#part-filter").addEventListener("keydown",event=>{if(event.key === "Enter"){event.preventDefault();applyDashboardFilters();}});
$("#clear-filter").addEventListener("click",()=>{
  $("#from-date").value=""; $("#to-date").value=""; $("#part-filter").value="";
  state.appliedFrom=""; state.appliedTo=""; state.partQuery=""; state.materialFilter="";
  updateMaterialOptions(getBaseFiltered()); render();
});
$("#records-form").addEventListener("submit",event=>{event.preventDefault();loadRecordPage(0);});
$("#clear-record-filters").addEventListener("click",()=>{$("#record-search").value="";$("#records-from").value="";$("#records-to").value="";loadRecordPage(0);});
$("#records-prev").addEventListener("click",()=>loadRecordPage(Math.max(0,state.recordOffset-100)));
$("#records-next").addEventListener("click",()=>loadRecordPage(state.recordOffset+100));
$("#refresh").addEventListener("click",loadData); $("#retry").addEventListener("click",loadData);
$("#part-table").addEventListener("click",event=>{const button=event.target.closest("[data-part-detail]");if(button)showPart(button.dataset.partDetail);});
$("#records-table").addEventListener("click",event=>{const button=event.target.closest("[data-record-detail]");if(button)showRecord(Number(button.dataset.recordDetail));});
$("#detail-dialog").addEventListener("click",event=>{if(event.target === $("#detail-dialog")) $("#detail-dialog").close();});
$("#detail-content").addEventListener("click",event=>{
  const button = event.target.closest("[data-part-view]");
  if (!button || !state.openPartDetail) return;
  $("#detail-content").innerHTML = renderPartDialog(button.dataset.partView);
  $("#detail-dialog").scrollTop = 0;
});
async function apiJSON(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "ดำเนินการไม่สำเร็จ"); error.payload = payload; error.status = response.status; throw error; }
  return payload;
}
function applyAccess() {
  $("#database-management").hidden = !state.user;
  $("#signed-in-user").hidden = !state.user;
  $("#signed-in-user").textContent = state.user ? "Admin" : "";
  $("#logout-button").hidden = !state.user;
}
function setPage(pageId) {
  document.querySelectorAll(".nav-tab").forEach(button=>button.classList.toggle("active",button.dataset.page===pageId));
  document.querySelectorAll(".page-view").forEach(page=>page.hidden=page.id!==pageId);
  if(pageId==="records-page"&&!state.recordsLoaded)loadRecordPage(0);
  if(pageId==="system-page")loadSystemPage();
}
async function openPage(pageId) {
  if(pageId!=="system-page"){setPage(pageId);return;}
  state.pendingPage=pageId;
  if(!state.user){
    try{const {authenticated}=await apiJSON("/api/auth?action=me");if(authenticated)state.user={role:"admin",userId:"Admin"};}
    catch(error){$("#login-error").hidden=false;$("#login-error").textContent=error.message;}
  }
  if(!state.user){$("#login-dialog").showModal();return;}
  applyAccess();setPage(pageId);
}
$("#login-form").addEventListener("submit",async event=>{
  event.preventDefault(); $("#login-error").hidden=true;
  try { await apiJSON("/api/auth?action=login",{method:"POST",body:JSON.stringify({password:$("#login-password").value})}); state.user={role:"admin",userId:"Admin"}; $("#login-form").reset(); $("#login-dialog").close(); applyAccess(); openPage(state.pendingPage); }
  catch(error){$("#login-error").hidden=false;$("#login-error").textContent=error.message;}
});
$("#login-cancel").addEventListener("click",()=>{$("#login-dialog").close();setPage("dashboard-page");});
$("#logout-button").addEventListener("click",async()=>{await apiJSON("/api/auth?action=logout",{method:"POST",body:"{}"}).catch(()=>{});location.reload();});
async function loadSystemPage() {
  const select=$("#database-sheet"), current=select.value;
  const tabs=["Part","Material","Part.Materials","Machine","WasteRecord"];
  select.innerHTML='<option value="">เลือกชีต</option>'+tabs.map(tab=>'<option value="'+escapeHTML(tab)+'">'+escapeHTML(tab)+'</option>').join("");
  if(tabs.includes(current))select.value=current;
}
function csvEscape(value){const text=String(value??"");return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
function saveCSV(filename,headers,rows){const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));link.download=filename;link.click();URL.revokeObjectURL(link.href);}
$("#export-button").addEventListener("click",()=>{$("#export-error").hidden=true;$("#export-dialog").showModal();});
$("#export-dialog").addEventListener("click",event=>{if(event.target===$("#export-dialog"))$("#export-dialog").close();});
$("#export-cancel").addEventListener("click",()=>$("#export-dialog").close());
$(".export-close").addEventListener("click",()=>$("#export-dialog").close());
$("#export-form").addEventListener("change",event=>{if(event.target.name!=="export-range")return;const ranged=event.target.value==="range";$("#export-from").disabled=!ranged;$("#export-to").disabled=!ranged;});
$("#export-form").addEventListener("submit",async event=>{event.preventDefault();const ranged=$("#export-form input[name=\"export-range\"]:checked").value==="range",from=$("#export-from").value,to=$("#export-to").value,error=$("#export-error");error.hidden=true;if(ranged&&!from&&!to){error.textContent="เลือกวันที่เริ่มต้นหรือวันที่สิ้นสุดอย่างน้อยหนึ่งรายการ";error.hidden=false;return;}if(ranged&&from&&to&&from>to){error.textContent="วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด";error.hidden=false;return;}const submit=$("#export-form button[type=\"submit\"]");submit.disabled=true;submit.textContent="กำลังเตรียมไฟล์…";try{const params=new URLSearchParams({action:"export",all:String(!ranged),from:ranged?from:"",to:ranged?to:""});const result=await apiJSON("/api/admin?"+params);saveCSV("WasteRecord-export.csv",result.headers,result.rows);$("#export-dialog").close();}catch(error){const message=$("#export-error");message.textContent=error.message;message.hidden=false;}finally{submit.disabled=false;submit.textContent="ดาวน์โหลด CSV";}});
$("#load-database").addEventListener("click",async()=>{const tab=$("#database-sheet").value;if(!tab)return;try{const {headers,rows}=await apiJSON("/api/admin?action=sheet&tab="+encodeURIComponent(tab));state.databaseRows=[headers,...rows];$("#database-preview").innerHTML='<div class="table-scroll"><table><thead><tr>'+headers.map(h=>'<th>'+escapeHTML(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.slice(0,100).map(row=>'<tr>'+headers.map((_,i)=>'<td>'+escapeHTML(row[i]??"")+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><small>แสดงตัวอย่าง '+Math.min(rows.length,100)+' จาก '+rows.length+' แถว</small>'; }catch(error){$("#database-preview").textContent=error.message;}});
$("#download-template").addEventListener("click",async()=>{const tab=$("#database-sheet").value;if(!tab)return;try{const {headers}=await apiJSON("/api/admin?action=template&tab="+encodeURIComponent(tab));saveCSV(tab+"-template.csv",headers,[]);}catch(error){alert(error.message);}});
$("#download-all").addEventListener("click",async()=>{try{const {data}=await apiJSON("/api/admin?action=all");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob(["\uFEFF"+JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"}));link.download="database-export.json";link.click();URL.revokeObjectURL(link.href);}catch(error){alert(error.message);}});
function parseCSV(source){const text=source.replace(/^\uFEFF/,"");const rows=[];let row=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===","){row.push(cell);cell="";}else if(c==="\n"){row.push(cell.replace(/\r$/, ""));if(row.some(value=>value!==""))rows.push(row);row=[];cell="";}else cell+=c;}row.push(cell.replace(/\r$/, ""));if(row.some(value=>value!==""))rows.push(row);return {headers:rows[0]||[],rows:rows.slice(1)};}
$("#preview-import").addEventListener("click",async()=>{const file=$("#import-file").files[0],tab=$("#database-sheet").value;if(!file||!tab){alert("เลือกชีตและไฟล์ CSV ก่อน");return;}try{const parsed=parseCSV(await file.text()),result=await apiJSON("/api/admin",{method:"POST",body:JSON.stringify({action:"preview-import",tab,mode:$("#import-mode").value,...parsed})});state.importData={tab,mode:$("#import-mode").value,...parsed};state.importReport=result.report;const report=result.report;$("#import-report").hidden=false;$("#import-report").innerHTML='<strong>ตรวจพบ '+result.rowCount+' แถว</strong>'+(report.problems.length?'<p class="form-error">ข้อผิดพลาด: '+report.problems.map(escapeHTML).join(" · ")+'</p>':'<p>ไม่พบข้อมูลซ้ำหรือรูปแบบผิด</p>')+(report.warnings.length?'<p>รายการเตือน: '+report.warnings.map(escapeHTML).join(" · ")+'</p>':'');$("#commit-import").disabled=!report.valid;}catch(error){$("#import-report").hidden=false;$("#import-report").textContent=error.message;$("#commit-import").disabled=true;}});
$("#commit-import").addEventListener("click",async()=>{if(!state.importData||!state.importReport?.valid)return;const warning=state.importReport.warnings.length>0;const text=state.importData.mode==="replace"?"การนำเข้าแบบแทนที่จะลบข้อมูลเดิมทั้งชีตและใส่ข้อมูลจากไฟล์แทน":"ยืนยันเพิ่มข้อมูลจากไฟล์ต่อท้ายชีต";if(!confirm(text+(warning?" และมีรายการเตือนที่ตรวจพบ":"")+" ต้องการดำเนินการหรือไม่?"))return;try{await apiJSON("/api/admin",{method:"POST",body:JSON.stringify({action:"import",...state.importData,acceptWarnings:warning})});alert("นำเข้าข้อมูลเรียบร้อย");$("#import-file").value="";state.importData=null;state.importReport=null;$("#import-report").hidden=true;$("#commit-import").disabled=true;$("#load-database").click();loadData();}catch(error){if(error.payload?.report){state.importReport=error.payload.report;$("#import-report").hidden=false;$("#import-report").innerHTML='<p>'+error.message+'</p>'+error.payload.report.warnings.map(escapeHTML).join(" · ");}else alert(error.message);}});
loadData();

