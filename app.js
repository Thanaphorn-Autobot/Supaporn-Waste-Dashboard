const $ = selector => document.querySelector(selector);
const nf = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { records: [], unresolved: 0, recordRows: [], recordTotal: 0, recordOffset: 0, recordsLoaded: false, recordsBusy: false };
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
function getFiltered() {
  const from = $("#from-date").value, to = $("#to-date").value;
  const query = $("#part-filter").value.trim().toLocaleLowerCase("th");
  return state.records.filter(r => (!from || r.date >= from) && (!to || r.date <= to) && (!query || partText(r).includes(query)));
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
  renderTrend(rows); renderDefects(rows); renderParts(rows, ng); renderMaterials(rows);
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
function renderParts(rows, totalNg) {
  const parts = new Map();
  for (const r of rows) {
    const key = r.partNo || r.partId || "ไม่ระบุ Part No", p = parts.get(key) || { key, partNo: r.partNo, partName: r.partName, partSubNo: r.partSubNo, partSubName: r.partSubName, produced: 0, ng: 0 };
    p.produced += r.produced; p.ng += r.ng; parts.set(key, p);
  }
  const top = [...parts.values()].sort((a,b) => b.ng-a.ng).slice(0, 10), max = top[0]?.ng || 1;
  $("#part-table").innerHTML = top.length ? top.map((p,i) => '<tr><td class="rank">' + String(i+1).padStart(2,"0") + '</td><td class="part-code">' + escapeHTML(p.partNo || "—") + '</td><td class="part-name" title="' + escapeHTML(p.partName) + '">' + escapeHTML(p.partName || "—") + (p.partSubNo ? '<small class="subline">' + escapeHTML(p.partSubNo) + (p.partSubName ? " · " + escapeHTML(p.partSubName) : "") + '</small>' : "") + '</td><td class="number">' + nf.format(p.produced) + '</td><td class="number">' + nf.format(p.ng) + '</td><td class="number rate-cell">' + (p.produced ? pf.format(p.ng/p.produced*100) : "0.00") + '%</td><td><span class="share-track"><span class="share-fill" style="display:block;width:' + (p.ng/max*100) + '%"></span></span><span class="share-label">' + (totalNg ? pf.format(p.ng/totalNg*100) : "0.00") + '%</span></td><td><button class="small-action" data-part-detail="' + escapeHTML(p.key) + '">ดูกราฟ</button></td></tr>').join("") : '<tr><td colspan="8" class="loading">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>';
}
function renderMaterials(rows) {
  const total = {};
  for (const r of rows) for (const [name, kg] of Object.entries(r.materialWasteKg || {})) total[name] = (total[name] || 0) + kg;
  const items = Object.entries(total).filter(([,kg]) => kg > 0).sort((a,b) => b[1]-a[1]), max = items[0]?.[1] || 1;
  $("#material-chart").innerHTML = items.length ? items.map(([name,kg]) => '<div class="bar-row"><span class="bar-name" title="' + escapeHTML(name) + '">' + escapeHTML(name) + '</span><span class="bar-track"><span class="bar-fill material-fill" style="width:' + Math.max(2,kg/max*100) + '%"></span></span><span class="bar-value">' + kgf.format(kg) + '</span></div>').join("") : '<div class="loading">ไม่มีข้อมูลวัสดุที่คำนวณได้</div>';
}
function renderRecords() {
  const rows = state.recordRows;
  $("#record-count").textContent = nf.format(state.recordTotal) + " รายการ";
  $("#page-summary").textContent = state.recordsBusy ? "กำลังค้นหา…" : state.recordTotal ? "แสดง " + nf.format(state.recordOffset + 1) + "–" + nf.format(Math.min(state.recordOffset + rows.length, state.recordTotal)) + " จาก " + nf.format(state.recordTotal) + " รายการ" : "ไม่พบรายการที่ตรงกับเงื่อนไข";
  $("#records-prev").disabled = state.recordsBusy || state.recordOffset <= 0;
  $("#records-next").disabled = state.recordsBusy || state.recordOffset + rows.length >= state.recordTotal;
  $("#records-table").innerHTML = rows.length ? rows.map((r,index) => '<tr><td>' + shortDate(r.date) + '</td><td class="part-code">' + escapeHTML(r.partNo || "—") + '</td><td class="part-name">' + escapeHTML(r.partName || "—") + '</td><td>' + escapeHTML(r.partSubNo || "—") + '</td><td class="part-name">' + escapeHTML(r.partSubName || "—") + '</td><td class="number">' + nf.format(r.produced) + '</td><td class="number">' + nf.format(r.ng) + '</td><td class="number rate-cell">' + (r.produced ? pf.format(r.ng/r.produced*100) : "0.00") + '%</td><td><button class="small-action" data-record-detail="' + index + '">เปิดการ์ด</button></td></tr>').join("") : '<tr><td colspan="9" class="loading">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>';
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
  const rows = state.records.filter(r => (r.partNo || r.partId || "ไม่ระบุ Part No") === key), p = rows[0];
  if (!p) return;
  const ng = rows.reduce((sum,r)=>sum+r.ng,0), produced = rows.reduce((sum,r)=>sum+r.produced,0), defects = {};
  for (const r of rows) for (const [name,count] of Object.entries(r.defects || {})) defects[name] = (defects[name] || 0) + count;
  const title = (p.partNo || "—") + " · " + (p.partName || "ไม่ระบุชื่อ");
  showDialog('<p class="panel-kicker">PART WASTE DETAIL</p><h2>' + escapeHTML(title) + '</h2><p class="detail-date">' + escapeHTML(p.partSubNo || "") + (p.partSubName ? " · " + escapeHTML(p.partSubName) : "") + '</p><div class="detail-metrics"><div><small>รายการผลิต</small><strong>' + nf.format(rows.length) + '</strong></div><div><small>จำนวนผลิต</small><strong>' + nf.format(produced) + '</strong></div><div><small>NG รวม</small><strong>' + nf.format(ng) + '</strong></div><div><small>อัตรา NG</small><strong>' + (produced ? pf.format(ng/produced*100) : "0.00") + '%</strong></div></div><h3>กราฟสาเหตุของเสีย</h3>' + renderMiniBars(defects,produced));
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
document.querySelectorAll(".nav-tab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-tab").forEach(b=>b.classList.toggle("active", b === button));
  document.querySelectorAll(".page-view").forEach(page=>page.hidden = page.id !== button.dataset.page);
  if (button.dataset.page === "records-page" && !state.recordsLoaded) loadRecordPage(0);
}));
$("#from-date").addEventListener("change", render); $("#to-date").addEventListener("change", render);
$("#part-filter").addEventListener("input", render);
$("#clear-filter").addEventListener("click",()=>{$("#from-date").value="";$("#to-date").value="";$("#part-filter").value="";render();});
$("#records-form").addEventListener("submit",event=>{event.preventDefault();loadRecordPage(0);});
$("#clear-record-filters").addEventListener("click",()=>{$("#record-search").value="";$("#records-from").value="";$("#records-to").value="";loadRecordPage(0);});
$("#records-prev").addEventListener("click",()=>loadRecordPage(Math.max(0,state.recordOffset-100)));
$("#records-next").addEventListener("click",()=>loadRecordPage(state.recordOffset+100));
$("#refresh").addEventListener("click",loadData); $("#retry").addEventListener("click",loadData);
$("#part-table").addEventListener("click",event=>{const button=event.target.closest("[data-part-detail]");if(button)showPart(button.dataset.partDetail);});
$("#records-table").addEventListener("click",event=>{const button=event.target.closest("[data-record-detail]");if(button)showRecord(Number(button.dataset.recordDetail));});
$("#detail-dialog").addEventListener("click",event=>{if(event.target === $("#detail-dialog")) $("#detail-dialog").close();});
loadData();
