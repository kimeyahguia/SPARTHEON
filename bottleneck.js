/* =====================================================================
   SPARTHEON · Course Bottleneck Analysis module  (v5 – redesigned layout)
   - Standalone: injects its own CSS, DOM, button and logic. Existing dashboard code is NOT edited.
   - Needs: Chart.js (already loaded by the dashboard) + dashboard_data.js loaded BEFORE this file.
   - Reads the export as-is: dashboardData.tables.{course_bottleneck_ranking, course_outcomes_summary,
       historical_performance_summary, program_performance_summary, frequent_failed_course_itemsets,
       failed_course_association_rules, prerequisite_diagnostic, period_actual_progression_summary,
       progression_source_comparison, schema_validation, dataset_quality_overview, validation_report}
   - Everything is computed from those tables. Nothing is invented. Descriptive and diagnostic only.
   - Entry: "Course Bottlenecks" button in the Academic Administrator (VCAA) top bar

   Page structure
     1 Overview            4 KPI cards
     2 Main Analytics      6 charts in a two-column grid
     3 Key Academic Insights
     4 Management Action Center (each recommendation shows its supporting metrics)
     5 Additional Details  expandable: association rules, score breakdown, dependency map,
                           student progression, data quality & validation
   ===================================================================== */
(function () {
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v, d = 1) => v == null || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%';
const num = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toFixed(d);
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
const uniq = a => [...new Set(a)];
const icon = (n, s = 17) => typeof ico === 'function' ? ico(n, s) : '';

/* hover explanation badge (ⓘ); text is shown by one floating tooltip, see tipInit() */
function tip(t) { return `<span class="bn-i" tabindex="0" role="note" aria-label="${esc(t)}" data-tip="${esc(t)}">i</span>`; }

const ROLES_WITH_MODULE = ['admin'];            /* roles that see the module button */
const LS_KEY = 'spartheon.bn.v1';               /* saved filters */
const REQUIRED_TABLES = ['course_bottleneck_ranking', 'course_outcomes_summary', 'historical_performance_summary',
  'program_performance_summary', 'frequent_failed_course_itemsets', 'failed_course_association_rules',
  'prerequisite_diagnostic', 'period_actual_progression_summary', 'progression_source_comparison',
  'schema_validation', 'dataset_quality_overview', 'validation_report'];

/* Priority labels come from the export: "High priority", "Moderate priority", "Routine monitoring" */
const PRI_OF = { 'High priority': 'High', 'Moderate priority': 'Moderate', 'Routine monitoring': 'Routine' };
const PRIS = ['High', 'Moderate', 'Routine'];
const PRI_PILL = { High: 'r', Moderate: 'y', Routine: '' };
const PRI_COL = { High: '#c62b30', Moderate: '#e3a600', Routine: '#2e9e5b' };
const PRI_ORDER = { High: 0, Moderate: 1, Routine: 2 };

/* Score = 100 × Σ weight × component. Weights recovered from the export (checked in init). */
const COMPONENTS = [
  { k: 'failure',        f: 'failure_component',        t: 'Failure rate',            w: 0.35, col: '#c62b30' },
  { k: 'repeat',         f: 'repeat_component',         t: 'Repetition',              w: 0.20, col: '#e3a600' },
  { k: 'recurrence',     f: 'recurrence_component',     t: 'Recurrence across periods', w: 0.20, col: '#3978b8' },
  { k: 'student_impact', f: 'student_impact_component', t: 'Student impact',          w: 0.15, col: '#22364f' },
  { k: 'downstream',     f: 'downstream_component',     t: 'Downstream blocking',     w: 0.10, col: '#2a9d8f' }
];
/* completion bands: display grouping of each student's actual completion rate (not a prediction) */
const BANDS = ['80% or more', '60–79%', 'Below 60%'];
const BAND_COL = { '80% or more': '#22364f', '60–79%': '#e3a600', 'Below 60%': '#c62b30' };
let RATE_SCALE = 100;   /* 100 if the export stores 0–1, 1 if it stores 0–100 */
const bandOf = r => { const v = (Number(r) || 0) * RATE_SCALE; return v >= 80 ? BANDS[0] : v >= 60 ? BANDS[1] : BANDS[2]; };
const REC_CAT = [['assessment', 'Course support'], ['repeat-attempt', 'Student advising'], ['successive', 'Monitoring'],
  ['prerequisite', 'Prerequisite readiness'], ['unsuccessful', 'Student support'], ['routine', 'Monitoring']];
const recCat = a => (REC_CAT.find(([k]) => a.toLowerCase().includes(k)) || [0, 'General'])[1];

let D, T, RK, RKID, EDG, SUCC, PREDOF, STU, FAILBY, BLOCKBY, PARTNER, BAND_MIN;
let ready = false, btn = null, initError = '', lastFocus = null;
let F = { col: 'all', prog: 'all', course: 'all', pri: 'all' };
let V = {}, ch = {}, sel = null, recLimit = 12, mapMode = 'chains', rankSort = 'rank', recP = 'all', recC = 'all';

/* ---------- persistence (never throws) ---------- */
function loadPrefs() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!o) return;
    if (o.F && typeof o.F === 'object') F = Object.assign(F, { col: o.F.col || 'all', prog: o.F.prog || 'all', course: o.F.course || 'all', pri: o.F.pri || 'all' });
  } catch (e) { /* storage unavailable or corrupt: ignore */ }
}
function savePrefs() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ F })); } catch (e) { /* ignore */ }
}

/* ---------- inline notice instead of alert() ---------- */
function notice(msg) {
  let n = $('bnNotice');
  if (!n) {
    n = document.createElement('div');
    n.id = 'bnNotice';
    n.setAttribute('role', 'alert');
    n.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:50;max-width:min(560px,92vw);background:#fff8e1;border:1px solid #f1dc9a;border-left:5px solid #c62b30;border-radius:12px;padding:10px 14px;font:500 13px/1.45 system-ui,sans-serif;color:#1c2733;box-shadow:0 10px 30px rgba(34,54,79,.18)';
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.display = 'block';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.display = 'none'; }, 8000);
}

/* =====================================================================
   STYLES (scoped to #bn / #bnModal / #bnTip)
   ===================================================================== */
const CSS = `
/* low-specificity fallbacks for modal classes; the dashboard's own rules win on ties */
:where(#bnModal) .crit{font-size:.78rem;margin:6px 0}
:where(#bnModal) .crit .bar{height:7px;background:#e6ebf2;border-radius:4px;margin-top:3px;overflow:hidden}
:where(#bnModal) .crit .bar div{height:100%;background:#22364f}
:where(#bnModal) .rows>div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e6ebf2;font-size:.78rem}
:where(#bnModal) .rows span{color:#6b7685}
:where(#bnModal) .rows i{font-style:normal;text-align:right}
:where(#bnModal) .sec-h{font-weight:700;color:#22364f;margin-top:14px;font-size:.84rem}
:where(#bnModal) .crumb{color:#6b7685;font-size:.74rem;margin:2px 0 6px}
:where(#bnModal) .cm{background:#f4f7fb;border-radius:10px;padding:8px 10px;margin:6px 0;font-size:.78rem}
:where(#bnModal) .warn{background:#fff8e1;border:1px solid #f1dc9a;border-radius:10px;padding:8px 10px;margin-top:12px;font-size:.74rem}

#bn,#bnModal,#bnTip{--navy:#22364f;--navy2:#2f4a6b;--red:#c62b30;--ink:#1c2733;--mute:#6b7685;--line:#e6ebf2;--soft:#f4f7fb;--g:#2e9e5b;--y:#e3a600;--rad:18px;--gap:16px;--h-main:340px;--shadow:0 6px 24px rgba(34,54,79,.07);--shadow-lg:0 10px 30px rgba(34,54,79,.12)}
#bn{display:none;max-width:1400px;margin:0 auto;padding:var(--gap)}

/* own 12-column grid so the module never depends on the dashboard's responsive rules */
#bn .layout{display:grid!important;grid-template-columns:repeat(12,minmax(0,1fr))!important;gap:var(--gap)!important;width:100%!important}
#bn .layout>*{grid-column:1/-1!important;min-width:0!important;max-width:100%!important}
#bn .layout>.s6{grid-column:span 6!important}
#bn .card{min-width:0!important;width:auto!important;box-sizing:border-box;display:flex;flex-direction:column}
#bn .bn-ch,#bn .bn-ch>canvas{width:100%!important;max-width:100%}
@media (max-width:860px){
  #bn .layout>.s6{grid-column:1/-1!important}
}

/* header, filters, navigation */
#bn .top{flex-wrap:wrap;row-gap:8px}
#bn .bn-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:rgba(255,255,255,.96);border-radius:16px;padding:9px 14px;box-shadow:var(--shadow);position:sticky;top:8px;z-index:6}
#bn .bn-filters .btn{margin-left:auto}
#bn .bn-filters select{max-width:230px}
#bn .bn-nav{display:flex;gap:6px;flex-wrap:wrap}
#bn .bn-nav button{font-size:.74rem;padding:6px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.92);color:var(--navy);font-weight:600;cursor:pointer}
#bn .bn-nav button:hover{background:#fff;border-color:var(--navy)}
#bn .bn-disc{display:flex;gap:10px;align-items:flex-start;background:#fff8e1;border:1px solid #f1dc9a;border-left:5px solid var(--y);border-radius:12px;padding:9px 14px;font-size:.76rem;color:var(--ink)}

#bn .bn-disc.bn-scope-note{background:#eef3fa;border-color:#cfdbec;border-left-color:var(--navy)}

/* section headings */
#bn .bn-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:1.05rem;color:var(--navy);margin-top:10px;padding-left:10px;border-left:5px solid var(--red);scroll-margin-top:92px}
#bn .bn-h small{font-weight:500;font-size:.74rem;color:var(--mute)}

/* KPI cards */
#bn .bn-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--gap)}
#bn .kpi{cursor:help}
#bn .kpi:hover{transform:none;box-shadow:var(--shadow)}
#bn .kpi:focus-visible,#bn .bn-i:focus-visible{outline:2px solid var(--navy);outline-offset:2px}
@media (max-width:900px){#bn .bn-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* cards and charts */
#bn .card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
#bn .card-head h4{display:flex;align-items:center;flex-wrap:wrap;gap:2px}
#bn .caption{line-height:1.45;margin:2px 0 8px;font-size:.76rem;color:var(--mute)}
#bn .bn-sc{font-size:.62rem;font-weight:600;letter-spacing:.02em;color:var(--mute);background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:1px 8px;margin-left:8px;white-space:nowrap}
#bn .bn-ch{position:relative;height:300px}
#bn .bn-ch.tall{height:var(--h-main)}
#bn .bn-ch.short{height:260px}
#bn .bn-scroll{overflow:auto;max-height:520px}
#bn .bn-scrollx{overflow-x:auto;padding-bottom:4px}
#bn .bn-hint{display:none}
#bn .bn-t{width:100%;border-collapse:collapse;font-size:.76rem}
#bn .bn-t th{text-align:left;color:var(--mute);font-weight:600;font-size:.68rem;border-bottom:1px solid var(--line);padding:6px;position:sticky;top:0;background:#fff;white-space:nowrap;z-index:1}
#bn .bn-t td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
#bn .bn-t td.n,#bn .bn-t th.n{text-align:right;font-variant-numeric:tabular-nums}
#bn .bn-t tr.clk{cursor:pointer}
#bn .bn-t tr.clk:hover{background:var(--soft)}
#bn .bn-t b{color:var(--navy)}
#bn .bn-sub{display:block;font-size:.68rem;color:var(--mute)}
#bn .bn-bar{display:inline-block;height:7px;border-radius:4px;background:linear-gradient(90deg,var(--navy),var(--navy2));vertical-align:middle;margin-right:6px}
#bn .bn-map svg{display:block}
#bn .bn-node{cursor:pointer}
#bn .bn-node text{font:600 10px system-ui,sans-serif;fill:#1c2733;pointer-events:none}
#bn .bn-edge{fill:none;stroke:#c3ccd8;stroke-width:1.2}
#bn .bn-edge.down{stroke:var(--red);stroke-width:2}
#bn .bn-edge.up{stroke:var(--navy);stroke-width:2}
#bn .bn-edge.dim{stroke:#e6ebf2}
#bn .bn-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
#bn .bn-chip{font-size:.68rem;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:2px 8px;color:var(--navy);font-weight:600}
#bn .bn-fine{font-size:.7rem;color:var(--mute);margin-top:6px}
#bn .bn-fine li{margin:3px 0 3px 16px}
#bn .bn-ok{color:var(--g);font-weight:700}
#bn .bn-bad{color:var(--red);font-weight:700}

/* insights */
#bn .bn-ins{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:4px}
#bn .bn-ins li{background:var(--soft);border-radius:12px;padding:11px 14px;border-left:4px solid var(--navy);font-size:.79rem;line-height:1.5;color:var(--ink)}
#bn .bn-ins li b{color:var(--navy)}

/* action center */
#bn .bn-recs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr));gap:12px}
#bn .bn-rec{background:var(--soft);border-radius:14px;padding:12px 14px;border-left:5px solid var(--line);cursor:pointer;font-size:.76rem;display:flex;flex-direction:column}
#bn .bn-rec:hover{background:#e9eff8}
#bn .bn-rec h5{font-size:.86rem;color:var(--navy);margin:6px 0 2px}
#bn .bn-rec p{margin-top:5px;color:var(--ink);line-height:1.45}
#bn .bn-rec .lbl{font-size:.64rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--mute);margin-top:10px}
#bn .bn-met{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:6px;margin-top:5px}
#bn .bn-met div{background:#fff;border-radius:10px;padding:6px 8px;text-align:center;border:1px solid var(--line)}
#bn .bn-met b{display:block;font-size:.92rem;color:var(--navy);font-variant-numeric:tabular-nums}
#bn .bn-met span{font-size:.62rem;color:var(--mute)}
#bn .bn-rec .meta{color:var(--mute);font-size:.68rem;margin-top:8px}

/* expandable detail views */
#bn .bn-dwrap{display:flex;flex-direction:column;gap:10px}
#bn .bn-det{background:rgba(255,255,255,.96);border-radius:var(--rad);box-shadow:var(--shadow);border:1px solid var(--line)}
#bn .bn-det>summary{cursor:pointer;list-style:none;padding:14px 18px;font-weight:700;color:var(--navy);font-size:.9rem;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:var(--rad)}
#bn .bn-det>summary::-webkit-details-marker{display:none}
#bn .bn-det>summary::after{content:'+';font-size:1.2rem;line-height:1;color:var(--mute);flex:none}
#bn .bn-det[open]>summary::after{content:'–'}
#bn .bn-det>summary:hover{background:var(--soft)}
#bn .bn-det>summary:focus-visible{outline:2px solid var(--navy);outline-offset:-2px}
#bn .bn-det>summary small{display:block;font-weight:500;font-size:.72rem;color:var(--mute);margin-top:2px}
#bn .bn-dbody{padding:4px 16px 16px}
#bn .bn-det .card{box-shadow:none;border:1px solid var(--line)}
#bn .bn-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gap)}
#bn .bn-g2>.full{grid-column:1/-1}
#bn .bn-g21{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:var(--gap)}
@media (max-width:860px){#bn .bn-g2,#bn .bn-g21{grid-template-columns:1fr}}

.bn-i{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#f4f7fb;border:1px solid #e6ebf2;color:#22364f;font:700 9px/1 system-ui,sans-serif;margin-left:6px;cursor:help;vertical-align:middle;flex:none}
.bn-i:hover,.bn-i:focus{background:#22364f;color:#fff;outline:none}
#bnTip{display:none;position:fixed;z-index:40;max-width:300px;background:#22364f;color:#fff;font:500 12px/1.45 system-ui,sans-serif;padding:9px 12px;border-radius:10px;box-shadow:var(--shadow-lg);pointer-events:none}
#bnModal{display:none;position:fixed;inset:0;background:rgba(20,30,45,.45);align-items:center;justify-content:center;z-index:30;padding:14px}
#bnModal .box{background:#fff;border-radius:22px;padding:24px;width:min(860px,100%);max-height:92vh;overflow:auto}
#bnModal .box:focus{outline:none}
#bnModal h3{color:var(--navy);font-size:1.1rem}

@media (max-width:700px){
  #bn{padding:10px}
  #bn .bn-filters{position:static}
  #bn .bn-kpis{grid-template-columns:1fr}
  #bn .bn-filters select{flex:1 1 140px;max-width:none}
  #bn .bn-filters .btn{margin-left:0}
  #bn{--h-main:300px}
  #bn .bn-ch,#bn .bn-ch.short{height:260px}
  #bn .bn-hint{display:block}
  #bnModal .box{padding:16px}
}
/* the module can be printed / saved as PDF; only the controls are hidden */
@media print{
  #bnModal,#bnTip,#bnNotice{display:none!important}
  #bn .top .btn,#bn .bn-filters,#bn .bn-nav,#bn #bnMore,#bn .bn-hint{display:none!important}
  #bn .card{break-inside:avoid;box-shadow:none}
  #bn .bn-scroll{max-height:none;overflow:visible}
}
`;

/* =====================================================================
   TEMPLATE: 1 Overview · 2 Main Analytics · 3 Insights · 4 Action Center · 5 Details
   ===================================================================== */
const TEMPLATE = `<main class="layout">
<header class="top full">
  <img class="logo" src="spartheonLogo.jpg" alt="SPARTHEON" onerror="this.style.display='none'">
  <div class="who"><b>Course Bottleneck Analysis</b><span>Academic Administrator · Strategic module</span><small>Export generated <span id="bnGen"></span></small></div>
  <div class="spacer"></div>
  <span class="pill y" data-tip="The export is synthetic (sample students and courses). It demonstrates the method, not real institutional findings.">SYNTHETIC DATA</span>
  <button class="btn alt" id="bnCsv" data-tip="Download the currently filtered course ranking as a CSV file.">Export ranking CSV</button>
  <button class="btn alt" id="bnPrint" data-tip="Print or save the page as PDF. All expandable detail sections are opened first.">Print / PDF</button>
  <button class="btn" id="bnBack">${icon('back', 15)} Dashboard</button>
  <button class="btn alt" onclick="backToRoles()">Roles</button>
</header>

<div class="bn-disc full" role="note"><span>${icon('info', 16)}</span><span><b>Synthetic demonstration data.</b> Every course, student and score shown here comes from a generated sample dataset. It is not an actual institutional record and must not be used for real decisions.</span></div>

<div class="bn-disc bn-scope-note full" role="note"><span>${icon('info', 16)}</span><span><b>Descriptive and diagnostic only.</b> This dashboard and its recommendations summarize what the recorded data shows and point to where attention may be needed. They are not predictions or forecasts, and they do not decide actions on their own; use them to support, not replace, academic judgment.</span></div>

<div class="bn-filters full">
  <span class="f-label">Filters ${tip('Narrow the course-based views to a college, program, course or priority level. The Historical Academic Performance chart and the period tables always show the whole sample.')}</span>
  <select id="bnCol" aria-label="College"></select>
  <select id="bnProg" aria-label="Program"></select>
  <select id="bnCourse" aria-label="Course"></select>
  <select id="bnPri" aria-label="Priority"></select>
  <button class="btn alt" id="bnReset">Reset</button>
</div>
<p class="note full" id="bnScope"></p>
<nav class="bn-nav full" id="bnNav" aria-label="Sections">
  <button data-go="bn1">1 Overview</button><button data-go="bn2">2 Analytics</button><button data-go="bn3">3 Insights</button>
  <button data-go="bn4">4 Action center</button><button data-go="bn5">5 Details</button>
</nav>

<section class="hero full"><h1>Course Bottleneck <em>Detection</em> &amp; Academic Progression</h1>
<p>Decision supported: which courses hold students back, who they affect downstream, and what to do first.</p></section>

<h2 class="bn-h full" id="bn1">1 · Overview <small>all observed periods pooled</small></h2>
<div class="bn-kpis full" id="bnKpis"></div>

<h2 class="bn-h full" id="bn2">2 · Main Analytics <small>click a bar or dot to open a course breakdown</small></h2>
<section class="card s6"><div class="card-head"><h4>Course Bottleneck Ranking (Top 10) ${tip('The ten highest-scoring courses. The score (0–100) is a weighted sum of five components: failure rate, repetition, recurrence across periods, student impact and downstream blocking. Dashed lines mark where the High and Moderate priority bands begin.')}</h4></div><p class="caption" id="bnCap1"></p><div class="bn-ch tall" id="cTop_w"></div></section>
<section class="card s6"><div class="card-head"><h4>Academic Difficulties by Program ${tip('Failed ÷ attempts for each program, next to the share of attempts that were retakes. Follows the college and program filters.')}</h4></div><p class="caption">Failure rate and repeat share of attempts per program.</p><div class="bn-ch tall" id="cProgPerf_w"></div></section>
<section class="card s6"><div class="card-head"><h4>Historical Academic Performance <span class="bn-sc">Whole sample</span> ${tip('Bars = course enrolments in each period; line = share of those enrolments that failed. System-wide for the whole sample; not affected by the filters.')}</h4></div><p class="caption" id="bnCap5"></p><div class="bn-ch tall" id="cHist_w"></div></section>
<section class="card s6"><div class="card-head"><h4>Course Failure vs. Repeat Rate ${tip('Each dot is a course (colour = priority). Courses toward the top right fail often and are retaken often. Hover for the name; click a dot for the breakdown.')}</h4></div><p class="caption" id="bnCapSc"></p><div class="bn-ch tall" id="cSc_w"></div></section>
<section class="card s6"><div class="card-head"><h4>Prerequisite Bottleneck Analysis ${tip('Top 10 prerequisite → successor links by students who failed the prerequisite, with the students who attempted and passed the successor. Click a bar for the prerequisite breakdown.')}</h4></div><p class="caption">Students who failed a prerequisite and what happened in the course that depends on it.</p><div class="bn-ch tall" id="cPre_w"></div></section>
<section class="card s6"><div class="card-head"><h4>Frequently Failed Courses (Apriori) ${tip('Sets of courses that students fail together. Support = share of failed-course transactions containing the whole set. Larger sets are listed first. Exploratory only.')}</h4></div><p class="caption" id="bnCap6a"></p><div class="bn-ch tall" id="cItems_w"></div></section>

<h2 class="bn-h full" id="bn3">3 · Key Academic Insights <small>computed live from the filtered data</small></h2>
<section class="card full"><div class="card-head"><h4>What the data shows ${tip('Plain-language findings that restate numbers from the charts above. Nothing is estimated beyond the exported tables.')}</h4></div><ul class="bn-ins" id="bnInsights"></ul></section>

<h2 class="bn-h full" id="bn4">4 · Management Action Center <small>rule-based recommendations with their supporting metrics</small></h2>
<section class="card full">
  <div class="card-head"><h4>Recommended Actions ${tip('The export attaches recommended actions to each course according to its evidence flags (not predictions). Each card shows the metrics behind it. Click a card for the course breakdown.')}</h4>
    <span><select id="bnRecP" aria-label="Priority"></select> <select id="bnRecC" aria-label="Category"></select></span></div>
  <p class="caption" id="bnCap8"></p><div class="bn-recs" id="bnRecs"></div>
  <p style="margin-top:12px;text-align:center"><button class="btn alt" id="bnMore" style="display:none">Show more</button></p>
</section>

<h2 class="bn-h full" id="bn5">5 · Additional Details <small>expand a section to open it</small></h2>
<div class="bn-dwrap full">

<details class="bn-det" id="bnDRules"><summary><span>Association rules<small>Which failed courses tend to appear together (exploratory)</small></span></summary>
  <div class="bn-dbody">
    <p class="caption" id="bnCap6b"></p><div class="bn-scroll" id="bnRules"></div>
  </div></details>

<details class="bn-det" id="bnDScore"><summary><span>Course score breakdown<small>Every course's 0–100 score split into its five weighted components</small></span></summary>
  <div class="bn-dbody"><div class="bn-g2">
    <section class="card full">
      <div class="card-head"><h4>Ranked Courses · Score Composition ${tip('Each bar is one course; its segments show how many of the 0–100 points come from each of the five components. Hover for rates and priority; click for the full breakdown. Scroll sideways if there are many courses.')}</h4>
        <label style="font-size:.74rem;color:var(--mute)">Sort by <select id="bnSort"><option value="rank">Bottleneck score</option><option value="failure">Failure rate</option><option value="repeat">Repeat rate</option><option value="students">Students with a failure</option><option value="code">Course code</option></select></label></div>
      <p class="caption" id="bnCap2"></p>
      <p class="bn-fine bn-hint">↔ Swipe sideways to see all courses.</p>
      <div class="bn-scrollx"><div class="bn-ch tall" id="cRank_w"></div></div>
    </section>
    <section class="card full"><div class="card-head"><h4>Main Score Drivers ${tip('For each course, the component that contributes the most points. This chart counts how often each component is the top driver across the courses in view.')}</h4></div><p class="caption">Number of courses by their top-driving component.</p><div class="bn-ch short" id="cDrv_w"></div></section>
  </div></div></details>

<details class="bn-det" id="bnDMap"><summary><span>Prerequisite dependency map<small>Prerequisite → succeeding course, with the courses each one blocks</small></span></summary>
  <div class="bn-dbody"><div class="bn-g21">
    <section class="card"><div class="card-head"><h4>Dependency Map ${tip('Each box is a course; columns run from entry courses (left) to the courses that depend on them (right). Click a course: red links show courses it blocks, navy links show its prerequisites.')}</h4>
      <label style="font-size:.74rem;color:var(--mute)">Show <select id="bnMapMode"><option value="chains">High-priority chains only</option><option value="all">All dependencies in filter</option></select></label></div>
      <p class="caption" id="bnCap3"></p><div class="bn-scroll bn-map" id="bnMap"></div></section>
    <section class="card"><div class="card-head"><h4>Affected Succeeding Courses ${tip('Details for the course selected on the map: its prerequisites and every course downstream of it. Click a row for that course\'s breakdown.')}</h4></div><div id="bnMapInfo"></div></section>
  </div></div></details>

<details class="bn-det" id="bnDStu"><summary><span>Student progression<small>Completion bands, affected programs and cohorts, and period-by-period results</small></span></summary>
  <div class="bn-dbody"><div class="bn-g2">
    <section class="card"><div class="card-head"><h4>Completion Rate Bands ${tip('Distinct students who failed at least one course in view, grouped by their overall completion rate (courses passed ÷ courses taken). The bands are a display grouping, not a prediction.')}</h4></div><p class="caption" id="bnCap4"></p><div class="bn-ch" id="cStat_w"></div></section>
    <section class="card"><div class="card-head"><h4>Affected Students by Program ${tip('Students\' own programs, stacked by completion band. A program can be affected by courses owned by another program.')}</h4></div><p class="caption">Distinct students per program, split by completion band.</p><div class="bn-ch" id="cProg_w"></div></section>
    <section class="card"><div class="card-head"><h4>Affected Students by Admission Year ${tip('Shows whether the impact concentrates in earlier or later cohorts, stacked by completion band.')}</h4></div><p class="caption">Distinct students per admission cohort, split by completion band.</p><div class="bn-ch short" id="cYear_w"></div></section>
    <section class="card"><div class="card-head"><h4>Actual Progression by Period <span class="bn-sc">Whole sample</span> ${tip('Observed (not forecast) results for all students in the sample, period by period: share of attempted courses passed, and mean student completion rate.')}</h4></div><p class="caption" id="bnCap4b"></p><div class="bn-ch short" id="cPer_w"></div></section>
    <section class="card full"><div class="card-head"><h4>Period Progression Summary <span class="bn-sc">Whole sample</span> ${tip('The numbers behind the chart above, as exported. System-wide, not affected by the filters.')}</h4></div><div class="bn-scroll" id="bnPerTbl"></div></section>
  </div></div></details>

<details class="bn-det" id="bnDData"><summary><span>Data quality &amp; validation<small>Checks run on the export, datasets loaded, method notes and limitations</small></span></summary>
  <div class="bn-dbody"><div class="bn-g2">
    <section class="card"><div class="card-head"><h4>Validation Checks ${tip('Automated checks from the export: unique IDs, valid references, rates in range, weights summing to 1, scores in range.')}</h4></div><p class="caption" id="bnCap7"></p><div class="bn-scroll" id="bnVal"></div></section>
    <section class="card"><div class="card-head"><h4>Datasets Loaded ${tip('Each source table: row and column counts, duplicate rows and missing cells.')}</h4></div><div class="bn-scroll" id="bnSchema"></div></section>
    <section class="card full"><div class="card-head"><h4>Method Notes and Limitations</h4></div><ul class="bn-fine" id="bnLimits"></ul></section>
  </div></div></details>

</div>
</main>`;

/* =====================================================================
   INIT & NAVIGATION (the existing dashboard is left untouched; two globals are wrapped)
   ===================================================================== */
function chartDefaults() {
  if (typeof Chart === 'undefined') return;
  const d = Chart.defaults;
  d.font.family = 'inherit';
  d.color = '#1c2733';
  d.plugins.tooltip.backgroundColor = '#22364f';
  d.plugins.tooltip.padding = 10;
  d.plugins.tooltip.cornerRadius = 8;
  d.plugins.tooltip.boxPadding = 4;
  d.plugins.tooltip.titleFont = { size: 12, weight: '700' };
  d.plugins.tooltip.bodyFont = { size: 11 };
  d.plugins.tooltip.footerFont = { size: 10, weight: '400' };
  d.plugins.tooltip.footerColor = '#cfd8e3';
  d.plugins.legend.labels.usePointStyle = true;
  d.plugins.legend.labels.boxWidth = 8;
}

function tipInit() {
  const t = document.createElement('div');
  t.id = 'bnTip';
  document.body.appendChild(t);
  const hide = () => { t.style.display = 'none'; };
  const show = el => {
    t.textContent = el.dataset.tip;
    t.style.display = 'block';
    const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    let y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  };
  const find = e => e.target && e.target.closest ? e.target.closest('#bn [data-tip], #bnModal [data-tip]') : null;
  document.addEventListener('mouseover', e => { const el = find(e); el ? show(el) : hide(); });
  document.addEventListener('focusin', e => { const el = find(e); el ? show(el) : hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
}

/* find the export however the data file exposes it */
function findData() {
  if (window.dashboardData) return window.dashboardData;
  try { if (typeof dashboardData !== 'undefined') return dashboardData; } catch (e) { /* not defined */ }
  return null;
}

function init() {
  if (ready) return true;
  initError = '';
  if (typeof Chart === 'undefined') { initError = 'Chart.js is not loaded, so the Course Bottleneck charts cannot be drawn.'; return false; }
  if (!$('dash')) { initError = 'Course Bottleneck module could not find the dashboard container (#dash).'; return false; }
  D = findData();
  if (!D || !D.tables) { initError = 'Course Bottleneck data not found. Load dashboard_data.js before this file and make sure it exposes window.dashboardData.'; return false; }
  T = D.tables;
  const missing = REQUIRED_TABLES.filter(k => !Array.isArray(T[k]));
  if (missing.length) { initError = 'dashboard_data.js is missing required table(s): ' + missing.join(', ') + '.'; return false; }

  /* detect whether completion rates are stored as 0–1 or 0–100 */
  const maxRate = Math.max(0, ...T.progression_source_comparison.map(s => Number(s.actual_completion_rate) || 0));
  RATE_SCALE = maxRate <= 1 ? 100 : 1;

  const outs = Object.fromEntries(T.course_outcomes_summary.map(o => [o.course_id, o]));
  RK = T.course_bottleneck_ranking.map(r => {
    const o = outs[r.course_id] || {};
    const row = Object.assign({}, o, r);
    row.priority_raw = r.priority;
    row.priority = PRI_OF[r.priority] || r.priority;
    row.college_code = o.college_code || '';
    row.college_name = o.college_name || o.college_code || '';
    row.program_name = o.program_name || r.program_code;
    row.pts = COMPONENTS.map(c => 100 * c.w * r[c.f]);
    const top = row.pts.indexOf(Math.max(...row.pts));
    row.top_driver = r.historical_enrolled > 0 ? COMPONENTS[top].t : 'No attempts recorded';
    return row;
  });
  RKID = Object.fromEntries(RK.map(r => [r.course_id, r]));

  /* check the recovered weights against the exported scores */
  const maxErr = Math.max(0, ...RK.map(r => Math.abs(sum(r.pts, x => x) - r.bottleneck_score)));
  D._weightErr = maxErr;

  /* priority band start = lowest score in each band (used for guide lines and captions) */
  BAND_MIN = {};
  PRIS.forEach(p => { const s = RK.filter(r => r.priority === p).map(r => r.bottleneck_score); BAND_MIN[p] = s.length ? Math.min(...s) : null; });

  EDG = T.prerequisite_diagnostic;
  SUCC = {}; PREDOF = {};
  EDG.forEach(e => {
    (SUCC[e.prerequisite_course_id] = SUCC[e.prerequisite_course_id] || []).push(e.succeeding_course_id);
    (PREDOF[e.succeeding_course_id] = PREDOF[e.succeeding_course_id] || []).push(e.prerequisite_course_id);
  });

  /* students: failed courses and the successor courses they are held back from */
  STU = T.progression_source_comparison.map(s => {
    const failed = String(s.failed_course_ids || '').split(';').filter(Boolean);
    const succ = String(s.prerequisite_successor_courses_of_failed_courses || '').split(';').filter(Boolean).filter(c => !failed.includes(c));
    return Object.assign({}, s, { failed, succ, band: bandOf(s.actual_completion_rate) });
  });
  FAILBY = {}; BLOCKBY = {};
  STU.forEach(s => {
    s.failed.forEach(c => (FAILBY[c] = FAILBY[c] || new Set()).add(s.student_id));
    s.succ.forEach(c => (BLOCKBY[c] = BLOCKBY[c] || new Set()).add(s.student_id));
  });

  /* co-failure partners from the Apriori rules */
  PARTNER = {};
  T.failed_course_association_rules.forEach(r => {
    const all = r.antecedents.concat(r.consequents);
    all.forEach(c => { PARTNER[c] = uniq((PARTNER[c] || []).concat(all.filter(x => x !== c))); });
  });

  /* per-course helpers */
  const memo = {};
  const depth = id => memo[id] != null ? memo[id] : (memo[id] = (SUCC[id] || []).length ? 1 + Math.max(...SUCC[id].map(depth)) : 0);
  RK.forEach(r => {
    r.descendants = walk([r.course_id], SUCC).size;
    r.depth = depth(r.course_id);
    r.n_failed_students = (FAILBY[r.course_id] || new Set()).size;
    r.n_blocked_students = (BLOCKBY[r.course_id] || new Set()).size;
  });

  /* style goes FIRST in <head> so the dashboard's own CSS wins ties */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.insertBefore(style, document.head.firstChild);
  const sec = document.createElement('section');
  sec.id = 'bn';
  sec.innerHTML = TEMPLATE;
  $('dash').insertAdjacentElement('afterend', sec);
  const m = document.createElement('div');
  m.id = 'bnModal';
  m.innerHTML = '<div class="box" id="bnModalBox" role="dialog" aria-modal="true" aria-labelledby="bnModalTitle" tabindex="-1"></div>';
  document.body.appendChild(m);

  chartDefaults();
  tipInit();
  $('bnGen').textContent = (D.generated_at || '').replace('T', ' ').slice(0, 16) + ' UTC';
  loadPrefs();
  bind();
  ready = true;
  return true;
}

function openModule() {
  if (!init()) { notice(initError || 'Course Bottleneck module could not start.'); return; }
  $('dash').style.display = 'none';
  $('bn').style.display = 'block';
  scrollTo(0, 0);
  fillFilters();
  render();
}

/* leaving the module destroys its charts (they are rebuilt on the next open) */
function destroyCharts() {
  Object.keys(ch).forEach(k => { try { ch[k].destroy(); } catch (e) { /* ignore */ } delete ch[k]; });
}

function hideModule() {
  const bn = $('bn');
  if (bn) bn.style.display = 'none';
  const m = $('bnModal');
  if (m) m.style.display = 'none';
  const t = $('bnTip');
  if (t) t.style.display = 'none';
  destroyCharts();
  lastFocus = null;
}

function backToDashboard() {
  hideModule();
  $('dash').style.display = 'block';
  scrollTo(0, 0);
}

function injectButton() {
  const top = document.querySelector('#dash .top');
  if (!top) { console.warn('Course Bottleneck module: "#dash .top" not found, so the button was not added.'); return; }
  const rep = top.querySelector('button[onclick="openReport()"]');
  btn = document.createElement('button');
  btn.className = 'btn navy';
  btn.id = 'bnOpen';
  btn.style.display = 'none';
  btn.title = 'Open the Course Bottleneck Analysis module';
  btn.innerHTML = icon('alert', 15) + ' Course Bottlenecks';
  btn.onclick = openModule;
  if (rep) rep.insertAdjacentElement('beforebegin', btn);
  else top.appendChild(btn);

  /* wrap the two existing globals so the module hides/shows with the role flow */
  const enter = window.enterRole;
  const back = window.backToRoles;
  if (typeof enter === 'function') {
    window.enterRole = function (k) {
      hideModule();
      const out = enter.apply(this, arguments);
      btn.style.display = ROLES_WITH_MODULE.includes(k) ? '' : 'none';
      return out;
    };
  } else {
    console.warn('Course Bottleneck module: window.enterRole not found; the button will always be visible.');
    btn.style.display = '';
  }
  if (typeof back === 'function') {
    window.backToRoles = function () {
      hideModule();
      return back.apply(this, arguments);
    };
  } else {
    console.warn('Course Bottleneck module: window.backToRoles not found; the module will not auto-hide on "Roles".');
  }
}

/* =====================================================================
   FILTERS: every course-based section reads the same filtered view (V) built in compute()
   ===================================================================== */
const okC = r => (F.col === 'all' || r.college_code === F.col) && (F.prog === 'all' || r.program_code === F.prog) &&
  (F.course === 'all' || r.course_id === F.course) && (F.pri === 'all' || r.priority === F.pri);
const scopeOn = () => F.col !== 'all' || F.prog !== 'all' || F.course !== 'all' || F.pri !== 'all';
const touch = ids => !scopeOn() || ids.some(i => V.ids.has(i));
const codeOf = id => (RKID[id] || {}).course_code || id;
const nameOf = id => (RKID[id] || {}).course_name || '';
const colName = c => { const r = RK.find(x => x.college_code === c); return r ? r.college_name : c; };
const progLabel = p => { const r = RK.find(x => x.program_code === p); return r && r.program_name ? `${p} – ${r.program_name}` : p; };

function fillFilters() {
  const opt = (v, t, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`;
  const cols = uniq(RK.map(r => r.college_code)).sort();
  if (F.col !== 'all' && !cols.includes(F.col)) F.col = 'all';
  const progs = uniq(RK.filter(r => F.col === 'all' || r.college_code === F.col).map(r => r.program_code)).sort();
  if (F.prog !== 'all' && !progs.includes(F.prog)) F.prog = 'all';
  const courses = RK.filter(r => (F.col === 'all' || r.college_code === F.col) && (F.prog === 'all' || r.program_code === F.prog))
    .sort((a, b) => a.course_code < b.course_code ? -1 : 1);
  if (F.course !== 'all' && !courses.some(c => c.course_id === F.course)) F.course = 'all';
  if (F.pri !== 'all' && !PRIS.includes(F.pri)) F.pri = 'all';

  $('bnCol').innerHTML = opt('all', 'All Colleges', F.col) + cols.map(c => opt(c, `${c} – ${colName(c)}`, F.col)).join('');
  $('bnProg').innerHTML = opt('all', 'All Programs', F.prog) + progs.map(p => opt(p, progLabel(p), F.prog)).join('');
  $('bnCourse').innerHTML = opt('all', 'All Courses', F.course) + courses.map(c => opt(c.course_id, `${c.course_code} – ${c.course_name}`, F.course)).join('');
  $('bnPri').innerHTML = opt('all', 'All priorities', F.pri) + PRIS.map(p => opt(p, p === 'Routine' ? 'Routine monitoring' : p + ' priority', F.pri)).join('');

  const cats = uniq(RK.flatMap(r => actionsOf(r).map(recCat))).sort();
  $('bnRecP').innerHTML = opt('all', 'All priorities', recP) + PRIS.map(p => opt(p, p, recP)).join('');
  $('bnRecC').innerHTML = opt('all', 'All categories', recC) + cats.map(c => opt(c, c, recC)).join('');
}

const actionsOf = r => String(r.management_recommendation || '').split(/;\s*/).filter(Boolean);

/* the single filtered view shared by all sections */
function compute() {
  const rank = RK.filter(okC);
  const ids = new Set(rank.map(r => r.course_id));
  const bott = rank.filter(r => r.priority === 'High');
  const bids = new Set(bott.map(r => r.course_id));
  const stu = STU.filter(s => s.failed.some(c => ids.has(c)));
  V = {
    rank, ids, bott, bids, stu,
    bStu: new Set(STU.filter(s => s.failed.some(c => bids.has(c))).map(s => s.student_id)),
    blocked: walk(bids, SUCC),
    enrolled: sum(rank, r => r.historical_enrolled),
    failed: sum(rank, r => r.historical_failed)
  };
}

function walk(start, map) {
  const seen = new Set();
  const st = [...start];
  while (st.length) {
    const x = st.pop();
    (map[x] || []).forEach(y => { if (!seen.has(y)) { seen.add(y); st.push(y); } });
  }
  return seen;
}

/* program rows in view (college / program filters) */
const progRows = () => T.program_performance_summary.filter(p => F.prog === 'all' || p.program_code === F.prog)
  .filter(p => F.col === 'all' || RK.some(r => r.program_code === p.program_code && r.college_code === F.col));

/* =====================================================================
   RENDER
   Main sections (1–4) render every time. Detail sections (5) render only while open,
   and again when they are opened, so charts are always drawn at their real size.
   ===================================================================== */
const DETAILS = { bnDRules: [r6rules], bnDScore: [r2], bnDMap: [r3map], bnDStu: [r4], bnDData: [r7, rLimits] };

function safe(fn) { try { fn(); } catch (e) { console.error('Bottleneck module:', fn.name, e); } }
function resizeAll() { Object.values(ch).forEach(c => { try { c.resize(); } catch (e) { /* ignore */ } }); }
function runDetail(id) {
  const d = $(id);
  if (d && d.open && DETAILS[id]) DETAILS[id].forEach(safe);
}
function runDetails() { Object.keys(DETAILS).forEach(runDetail); }

function render() {
  compute();
  const f = [];
  if (F.col !== 'all') f.push(F.col);
  if (F.prog !== 'all') f.push(F.prog);
  if (F.course !== 'all') f.push(codeOf(F.course));
  if (F.pri !== 'all') f.push(F.pri + ' priority');
  $('bnScope').innerHTML = `In view: <b>${V.rank.length}</b> of ${RK.length} courses${f.length ? ' · ' + esc(f.join(' › ')) : ''}. All observed periods are pooled. Historical Academic Performance and the period tables cover the whole sample and ignore the filters.`;
  [r1, rTop, r5, r3chart, r6chart, r8].forEach(safe);
  runDetails();
  requestAnimationFrame(resizeAll);
}

/* ---------- chart helpers: wrapper div id + '_w' holds a fresh canvas each time ---------- */
function mk(id, cfg, emptyMsg) {
  if (ch[id]) { ch[id].destroy(); delete ch[id]; }
  const w = $(id + '_w');
  if (!w) return;
  if (!cfg) { w.innerHTML = `<p class="none">${icon('info', 14)} ${emptyMsg || 'No data for this filter.'}</p>`; return; }
  const card = w.closest('.card');
  const h4 = card && card.querySelector('h4');
  const label = h4 && h4.firstChild ? h4.firstChild.textContent.trim() : 'Chart';
  w.innerHTML = `<canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas>`;
  cfg.options = Object.assign({ animation: false, maintainAspectRatio: false, responsive: true }, cfg.options || {});
  ch[id] = new Chart($(id), cfg);
}
const legend = (extra = {}) => ({ display: true, position: 'bottom', labels: Object.assign({ boxWidth: 10, font: { size: 10 }, usePointStyle: true }, extra) });
const axisT = t => ({ display: true, text: t, font: { size: 10, weight: '600' }, color: '#6b7685' });
const tick = { font: { size: 9 }, color: '#6b7685' };
const grid = { color: '#eef2f7' };
const none = t => `<p class="none">${icon('info', 14)} ${t}</p>`;
const pill = p => `<span class="pill ${PRI_PILL[p] || ''}">${esc(p === 'Routine' ? 'Routine' : p)}</span>`;
const kpi = (cls, ic, title, val, sub, tp) => `<div class="kpi ${cls}" tabindex="0" data-tip="${esc(tp || '')}"><div class="ic">${icon(ic, 17)}</div><h3>${title}</h3><div class="v">${val}</div><div class="st">${sub}</div></div>`;
const tt = (cb = {}, note) => ({ callbacks: Object.assign(note ? { footer: () => note } : {}, cb) });
const hov = (_e, els, chart) => { chart.canvas.style.cursor = els.length ? 'pointer' : 'default'; };
const donutTip = note => tt({ label: p => { const tot = p.dataset.data.reduce((a, b) => a + b, 0); return ` ${p.label}: ${p.raw} (${pct(tot ? p.raw / tot : 0, 0)})`; } }, note);
/* dashed guide lines where the High and Moderate bands begin (taken from the export) */
const bands = axis => ({
  id: 'bnBands',
  afterDatasetsDraw(c) {
    const sc = c.scales[axis];
    if (!sc) return;
    const { ctx, chartArea: a } = c;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(107,118,133,.55)';
    ctx.fillStyle = '#6b7685';
    ctx.font = '9px system-ui, sans-serif';
    [['Moderate', BAND_MIN.Moderate], ['High', BAND_MIN.High]].forEach(([l, v]) => {
      if (v == null) return;
      const p = sc.getPixelForValue(v);
      ctx.beginPath();
      if (axis === 'y') { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(`${l} from ${num(v, 0)}`, a.right - 4, p - 3); }
      else { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); ctx.stroke(); ctx.textAlign = 'left'; ctx.fillText(`${l} from ${num(v, 0)}`, p + 3, a.top + 10); }
    });
    ctx.restore();
  }
});
const bandTxt = () => `High ≥ ${num(BAND_MIN.High, 1)}, Moderate ≥ ${num(BAND_MIN.Moderate, 1)}, Routine below`;

/* ---------- 1 + 3. KPI CARDS AND KEY INSIGHTS ---------- */
function r1() {
  const { rank, bott, bStu, blocked, stu } = V;
  const mod = rank.filter(r => r.priority === 'Moderate').length;
  const rate = V.enrolled ? V.failed / V.enrolled : null;
  const total = STU.length;
  $('bnKpis').innerHTML =
    kpi(bott.length ? 'r' : '', 'alert', 'High-Priority Courses', bott.length, `${mod} moderate · of ${rank.length} in view`, 'Courses the export classifies as High priority (top score band).') +
    kpi(stu.length ? 'y' : '', 'users', 'Students With Failures', stu.length, `${bStu.size} in High-priority courses · sample of ${total}`, 'Distinct students with at least one failed course among the courses in view. The line below counts those who failed a High-priority course.') +
    kpi(rate != null && rate > .25 ? 'y' : '', 'trend', 'Overall Failure Rate', pct(rate), `${V.failed} failed of ${V.enrolled} attempts`, 'Failed attempts ÷ all recorded attempts across the courses in view, all periods pooled.') +
    kpi(blocked.size ? 'y' : '', 'clock', 'Downstream Courses', blocked.size, `after ${V.bids.size} High-priority course${V.bids.size === 1 ? '' : 's'}`, 'Courses that sit anywhere downstream of a High-priority course in the prerequisite chain.');

  const top = [...rank].sort((a, b) => b.bottleneck_score - a.bottleneck_score)[0];
  const ins = [];
  if (top) ins.push(`<b>${esc(top.course_code)}</b> ${esc(top.course_name)} has the highest bottleneck score (<b>${num(top.bottleneck_score, 1)}</b>, ${esc(top.priority)} priority). Its main driver is ${esc(top.top_driver).toLowerCase()}.`);
  if (rank.length) ins.push(`<b>${bott.length}</b> of ${rank.length} courses are High priority; they sit upstream of <b>${blocked.size}</b> succeeding course${blocked.size === 1 ? '' : 's'}.`);
  if (stu.length) {
    const low = stu.filter(x => x.band === BANDS[2]).length;
    ins.push(`<b>${pct(low / stu.length, 0)}</b> of the ${stu.length} students with a failure here have completed fewer than 60% of the courses they took.`);
  }
  const pb = [...rank].filter(r => r.direct_successors > 0 && r.n_failed_students > 0).sort((a, b) => b.n_failed_students - a.n_failed_students)[0];
  if (pb) ins.push(`Prerequisite <b>${esc(pb.course_code)}</b> has the most students with a failure (<b>${pb.n_failed_students}</b>) and leads to ${pb.direct_successors} direct successor${pb.direct_successors === 1 ? '' : 's'}.`);
  const pp = progRows().filter(p => p.attempts > 0).sort((a, b) => b.failure_rate - a.failure_rate);
  if (pp.length > 1) ins.push(`<b>${esc(pp[0].program_code)}</b> has the highest failure rate among programs in view (<b>${pct(pp[0].failure_rate)}</b>, ${pp[0].failed} failed of ${pp[0].attempts} attempts).`);
  const rep = [...rank].sort((a, b) => b.observed_repeat_rate - a.observed_repeat_rate)[0];
  if (rep && rep.observed_repeat_rate > 0) ins.push(`<b>${esc(rep.course_code)}</b> has the highest repeat rate (<b>${pct(rep.observed_repeat_rate)}</b> of attempts are retakes).`);
  const rule = T.failed_course_association_rules.filter(r => touch(r.antecedents.concat(r.consequents))).sort((a, b) => b.lift - a.lift)[0];
  if (rule) ins.push(`Strongest co-failure pattern: students who fail <b>${esc(rule.antecedents.map(codeOf).join(' + '))}</b> also fail <b>${esc(rule.consequents.map(codeOf).join(' + '))}</b> in ${pct(rule.confidence, 0)} of cases (lift ${num(rule.lift, 1)}). Exploratory only.`);
  $('bnInsights').innerHTML = ins.slice(0, 6).map(i => `<li>${i}</li>`).join('') || `<li>No course matches this filter.</li>`;
}

/* ---------- 2a. TOP 10 RANKING ---------- */
function rTop() {
  const top = [...V.rank].sort((a, b) => b.bottleneck_score - a.bottleneck_score).slice(0, 10);
  $('bnCap1').textContent = top.length
    ? `Highest: ${top[0].course_code} (${num(top[0].bottleneck_score, 1)}). Bar colour = priority (${bandTxt()}).`
    : 'No course matches this filter.';
  mk('cTop', top.length ? {
    type: 'bar',
    data: { labels: top.map(r => r.course_code), datasets: [{ data: top.map(r => +r.bottleneck_score.toFixed(1)), backgroundColor: top.map(r => PRI_COL[r.priority]), borderRadius: 4 }] },
    plugins: [bands('x')],
    options: {
      indexAxis: 'y', onHover: hov,
      onClick: (_e, els) => { if (els.length) openCourse(top[els[0].index].course_id); },
      plugins: { legend: { display: false }, tooltip: tt({ title: it => { const r = top[it[0].dataIndex]; return `${r.course_code} – ${r.course_name}`; }, label: p => ` Score ${p.raw} · ${top[p.dataIndex].priority}`, afterLabel: p => { const r = top[p.dataIndex]; return [`Failure ${pct(r.historical_failure_rate)} · Repeat ${pct(r.observed_repeat_rate)}`, `Top driver: ${r.top_driver}`]; } }, ['Score = weighted sum of 5 components.', 'Click the bar for the full breakdown.']) },
      scales: { x: { min: 0, max: 100, title: axisT('Bottleneck score (0–100)'), ticks: tick, grid }, y: { ticks: { font: { size: 10 } }, grid: { display: false } } }
    }
  } : null);
}

/* ---------- 5a. DETAIL · SCORE BREAKDOWN (stacked score composition) ---------- */
function r2() {
  const key = {
    rank: r => -r.bottleneck_score,
    failure: r => -r.historical_failure_rate,
    repeat: r => -r.observed_repeat_rate,
    students: r => -r.n_failed_students,
    code: r => r.course_code
  };
  const rows = [...V.rank].sort((a, b) => key[rankSort](a) < key[rankSort](b) ? -1 : key[rankSort](a) > key[rankSort](b) ? 1 : 0);
  $('bnCap2').textContent = `${rows.length} courses. Each bar is the 0–100 score split into its five weighted components (weights ${COMPONENTS.map(c => c.t.toLowerCase() + ' ' + pct(c.w, 0)).join(', ')}).`;

  $('cRank_w').style.minWidth = rows.length ? Math.max(100, rows.length * 30) + 'px' : '0';
  mk('cRank', rows.length ? {
    type: 'bar',
    data: { labels: rows.map(r => r.course_code), datasets: COMPONENTS.map((c, i) => ({ label: c.t, backgroundColor: c.col, data: rows.map(r => +r.pts[i].toFixed(2)), borderWidth: 0 })) },
    plugins: [bands('y')],
    options: {
      onHover: hov, interaction: { mode: 'index', intersect: false },
      onClick: (_e, els) => { if (els.length) openCourse(rows[els[0].index].course_id); },
      plugins: {
        legend: legend(),
        tooltip: tt({
          title: it => { const r = rows[it[0].dataIndex]; return `${r.course_code} – ${r.course_name}`; },
          label: p => ` ${p.dataset.label}: ${p.raw} pts`,
          afterBody: it => { const r = rows[it[0].dataIndex]; return [`Total ${num(r.bottleneck_score, 1)} · ${r.priority} priority`, `${r.program_code} · Year ${r.year_level}`, `Failure ${pct(r.historical_failure_rate)} · Repeat ${pct(r.observed_repeat_rate)}`]; }
        }, ['Click the bar for the full score breakdown.'])
      },
      scales: { y: { stacked: true, min: 0, max: 100, title: axisT('Bottleneck score (0–100)'), ticks: tick, grid }, x: { stacked: true, ticks: { font: { size: 9 }, maxRotation: 70, minRotation: 45, color: '#6b7685' }, grid: { display: false } } }
    }
  } : null);

  const drv = {};
  V.rank.forEach(r => { drv[r.top_driver] = (drv[r.top_driver] || 0) + 1; });
  const dl = Object.entries(drv).sort((a, b) => b[1] - a[1]);
  mk('cDrv', dl.length ? {
    type: 'bar',
    data: { labels: dl.map(d => d[0]), datasets: [{ data: dl.map(d => d[1]), backgroundColor: dl.map(d => (COMPONENTS.find(c => c.t === d[0]) || {}).col || '#9aa5b4'), borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: tt({ label: p => ` ${p.raw} course${p.raw === 1 ? '' : 's'}` }, ['The component contributing most', 'points to each course\'s score.']) },
      scales: { x: { title: axisT('Courses'), ticks: Object.assign({ precision: 0 }, tick), grid }, y: { ticks: { font: { size: 10 } }, grid: { display: false } } }
    }
  } : null);
}

/* ---------- 2d. PREREQUISITE BOTTLENECK CHART (main) ---------- */
function r3chart() {
  const links = EDG.filter(e => V.ids.has(e.prerequisite_course_id)).sort((a, b) => b.students_with_prerequisite_failure - a.students_with_prerequisite_failure).slice(0, 10);
  mk('cPre', links.length ? {
    type: 'bar',
    data: { labels: links.map(e => `${e.prerequisite_code} → ${e.successor_code}`), datasets: [
      { label: 'Failed the prerequisite', backgroundColor: '#c62b30', borderRadius: 4, data: links.map(e => e.students_with_prerequisite_failure) },
      { label: 'Attempted the successor', backgroundColor: '#22364f', borderRadius: 4, data: links.map(e => e.students_with_successor_attempt) },
      { label: 'Passed the successor', backgroundColor: '#2e9e5b', borderRadius: 4, data: links.map(e => e.students_with_successor_pass) }] },
    options: {
      indexAxis: 'y', onHover: hov,
      onClick: (_e, els) => { if (els.length) openCourse(links[els[0].index].prerequisite_course_id); },
      plugins: {
        legend: legend(),
        tooltip: tt({
          title: it => { const e = links[it[0].dataIndex]; return `${e.prerequisite_code} ${e.prerequisite_name} → ${e.successor_code} ${e.successor_name}`; },
          afterBody: it => { const e = links[it[0].dataIndex]; const a = e.students_with_successor_attempt; return [`Of ${a} students who attempted the successor, ${e.students_with_successor_pass} passed (${pct(a ? e.students_with_successor_pass / a : null, 0)}).`]; }
        }, ['Click the bar for the prerequisite breakdown.'])
      },
      scales: { x: { title: axisT('Students'), ticks: Object.assign({ precision: 0 }, tick), grid }, y: { ticks: { font: { size: 10 } }, grid: { display: false } } }
    }
  } : null, 'No prerequisite link in this filter.');
}

/* ---------- 5b. DETAIL · DEPENDENCY MAP ---------- */
function r3map() {
  let nodes;
  if (mapMode === 'chains') {
    nodes = new Set(V.bids);
    walk(V.bids, SUCC).forEach(x => nodes.add(x));
    V.bids.forEach(b => (PREDOF[b] || []).forEach(p => nodes.add(p)));
  } else {
    nodes = new Set();
    EDG.forEach(e => {
      if (V.ids.has(e.prerequisite_course_id) || V.ids.has(e.succeeding_course_id)) { nodes.add(e.prerequisite_course_id); nodes.add(e.succeeding_course_id); }
    });
  }
  const edges = EDG.filter(e => nodes.has(e.prerequisite_course_id) && nodes.has(e.succeeding_course_id)).map(e => ({ s: e.prerequisite_course_id, t: e.succeeding_course_id }));
  const used = new Set();
  edges.forEach(e => { used.add(e.s); used.add(e.t); });
  V.bids.forEach(b => { if (nodes.has(b)) used.add(b); });
  const list = [...used].filter(id => RKID[id]);

  if (!list.length) {
    $('bnCap3').textContent = mapMode === 'chains' ? 'No High-priority course in this filter.' : 'No prerequisite links in this filter.';
    $('bnMap').innerHTML = none('Nothing to draw. Try "All dependencies in filter" or reset the filters.');
    $('bnMapInfo').innerHTML = none('Select a course on the map.');
    sel = null;
    return;
  }
  if (!sel || !used.has(sel)) sel = [...list].sort((a, b) => RKID[a].rank - RKID[b].rank)[0];

  const lv = {};
  list.forEach(n => { lv[n] = 0; });
  for (let i = 0; i < 12; i++) {
    let moved = false;
    edges.forEach(e => { if (lv[e.s] + 1 > lv[e.t]) { lv[e.t] = lv[e.s] + 1; moved = true; } });
    if (!moved) break;
  }
  const cols = {};
  list.forEach(n => (cols[lv[n]] = cols[lv[n]] || []).push(n));
  const NW = 112, NH = 26, GX = 64, GY = 8;
  const maxLv = Math.max(...Object.keys(cols).map(Number));
  const maxN = Math.max(...Object.values(cols).map(c => c.length));
  const pos = {};
  Object.entries(cols).forEach(([l, arr]) => {
    arr.sort((a, b) => PRI_ORDER[RKID[a].priority] - PRI_ORDER[RKID[b].priority] || (RKID[a].course_code < RKID[b].course_code ? -1 : 1));
    arr.forEach((id, i) => { pos[id] = { x: 10 + l * (NW + GX), y: 10 + i * (NH + GY) }; });
  });
  const W = 20 + (maxLv + 1) * (NW + GX) - GX;
  const H = 20 + maxN * (NH + GY) - GY;
  const down = walk([sel], SUCC);
  const up = walk([sel], PREDOF);
  const inDown = id => id === sel || down.has(id);
  const inUp = id => id === sel || up.has(id);

  const eSvg = edges.map(e => {
    const a = pos[e.s], b = pos[e.t];
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    const cls = inDown(e.s) && down.has(e.t) ? 'down' : inUp(e.t) && up.has(e.s) ? 'up' : sel ? 'dim' : '';
    return `<path class="bn-edge ${cls}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
  }).join('');
  const nSvg = list.map(id => {
    const r = RKID[id], p = pos[id];
    const on = id === sel || down.has(id) || up.has(id);
    return `<g class="bn-node" data-id="${id}" opacity="${on ? 1 : .35}"><title>${esc(r.course_code)} – ${esc(r.course_name)} · ${esc(r.priority)} · score ${num(r.bottleneck_score, 1)}</title>
      <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="8" fill="${PRI_COL[r.priority]}" fill-opacity="${r.priority === 'Routine' ? .12 : .22}" stroke="${PRI_COL[r.priority]}" stroke-width="${id === sel ? 3 : 1.4}"/>
      <text x="${p.x + 8}" y="${p.y + 17}">${esc(r.course_code)}</text></g>`;
  }).join('');
  $('bnCap3').textContent = `${list.length} courses, ${edges.length} links. Border colour = priority (red High, amber Moderate, green Routine). Click a course: red links = courses it blocks, navy links = its prerequisites.`;
  $('bnMap').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prerequisite dependency map">${eSvg}${nSvg}</svg>`;

  const r = RKID[sel];
  const affected = [...down].filter(id => RKID[id]).sort((a, b) => PRI_ORDER[RKID[a].priority] - PRI_ORDER[RKID[b].priority] || RKID[a].rank - RKID[b].rank);
  const prereqs = [...(PREDOF[sel] || [])];
  $('bnMapInfo').innerHTML = `<div class="msum" style="background:var(--soft);border-radius:12px;padding:9px 12px;font-size:.78rem"><b>${esc(r.course_code)} · ${esc(r.course_name)}</b> ${pill(r.priority)}
      <small style="display:block;color:var(--mute);margin-top:3px">Score ${num(r.bottleneck_score, 1)} · Failure ${pct(r.historical_failure_rate)} · ${r.direct_successors} direct / ${r.descendants} total successors</small></div>
    <p class="bn-fine"><b>Prerequisites:</b> ${prereqs.length ? prereqs.map(p => `<span class="bn-chip">${esc(codeOf(p))}</span>`).join(' ') : 'none (entry course)'}</p>
    <p class="bn-fine" style="margin-top:8px"><b>Affected succeeding courses (${affected.length}):</b></p>
    ${affected.length ? `<div class="bn-scroll" style="max-height:300px"><table class="bn-t"><tbody>${affected.map(id => { const a = RKID[id]; return `<tr class="clk" data-course="${id}"><td><b>${esc(a.course_code)}</b><span class="bn-sub">${esc(a.course_name)}</span></td><td class="n">${pct(a.historical_failure_rate)}</td><td>${pill(a.priority)}</td></tr>`; }).join('')}</tbody></table></div>` : none('This course does not block any other course.')}
    <p style="margin-top:10px"><button class="btn alt" data-course="${sel}">Open score breakdown</button></p>`;
}

/* ---------- 5c. DETAIL · STUDENT PROGRESSION ---------- */
function r4() {
  const stu = V.stu;
  const cnt = b => stu.filter(x => x.band === b).length;
  $('bnCap4').textContent = stu.length
    ? `${stu.length} distinct students with a failure in the courses in view; ${pct(cnt(BANDS[2]) / stu.length, 0)} have completed under 60% of the courses they took.`
    : 'No student with a failure for this filter.';
  mk('cStat', stu.length ? {
    type: 'doughnut',
    data: { labels: BANDS, datasets: [{ data: BANDS.map(cnt), backgroundColor: BANDS.map(b => BAND_COL[b]), borderColor: '#fff', borderWidth: 2 }] },
    options: { cutout: '62%', plugins: { legend: legend(), tooltip: donutTip(['Students counted once, by completion rate.']) } }
  } : null);

  const stack = (id, keyFn, labelFn, sortFn, axis) => {
    const keys = uniq(stu.map(keyFn)).sort(sortFn);
    mk(id, keys.length ? {
      type: 'bar',
      data: { labels: keys.map(labelFn), datasets: BANDS.map(b => ({ label: 'Completed ' + b, backgroundColor: BAND_COL[b], borderRadius: 3, data: keys.map(k => stu.filter(x => keyFn(x) === k && x.band === b).length) })) },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legend(), tooltip: tt({}, ['Distinct students per group and band.']) },
        scales: { x: { stacked: true, title: axisT(axis), ticks: tick, grid: { display: false } }, y: { stacked: true, title: axisT('Students'), ticks: Object.assign({ precision: 0 }, tick), grid } }
      }
    } : null);
  };
  stack('cProg', x => x.program_code, k => k, (a, b) => a < b ? -1 : 1, 'Student program');
  stack('cYear', x => x.admission_year, k => 'Admitted ' + k, (a, b) => a - b, 'Admission cohort');

  const per = T.period_actual_progression_summary;
  $('bnCap4b').textContent = per.length ? `Observed results for all ${per[0].students_observed} students across ${per.length} period${per.length === 1 ? '' : 's'} (not filtered).` : 'No period data.';
  mk('cPer', per.length ? {
    type: 'line',
    data: { labels: per.map(p => p.period_label.replace('Semester', 'Sem').replace(', AY ', ' · ')), datasets: [
      { label: 'Observed pass rate', data: per.map(p => +(p.observed_pass_rate * 100).toFixed(1)), borderColor: '#22364f', backgroundColor: '#22364f', tension: .25, pointRadius: 4 },
      { label: 'Mean completion rate', data: per.map(p => +(p.mean_student_completion_rate * 100).toFixed(1)), borderColor: '#2a9d8f', backgroundColor: '#2a9d8f', tension: .25, pointRadius: 4 }] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: legend(), tooltip: tt({ label: p => ` ${p.dataset.label}: ${p.parsed.y.toFixed(1)}%` }, ['Share of attempted courses passed.']) },
      scales: { y: { min: 0, max: 100, title: axisT('Rate (%)'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid }, x: { ticks: { font: { size: 9 }, maxRotation: 0, color: '#6b7685' }, grid: { display: false } } } }
  } : null);

  $('bnPerTbl').innerHTML = per.length ? `<table class="bn-t"><thead><tr><th>Period</th><th class="n">Students</th><th class="n">Attempted</th><th class="n">Passed</th><th class="n">Failed</th><th class="n">Repeated</th><th class="n">Pass rate</th><th class="n">Mean completion</th></tr></thead><tbody>
    ${per.map(p => `<tr><td><b>${esc(p.period_label)}</b></td><td class="n">${p.students_observed}</td><td class="n">${p.courses_attempted}</td><td class="n">${p.courses_passed}</td><td class="n">${p.courses_failed}</td><td class="n">${p.courses_repeated}</td><td class="n">${pct(p.observed_pass_rate)}</td><td class="n">${pct(p.mean_student_completion_rate)}</td></tr>`).join('')}</tbody></table>` : none('No period data.');
}

/* ---------- 2b, 2c, 2d. PROGRAM DIFFICULTIES, HISTORICAL PERFORMANCE, FAILURE VS REPEAT ---------- */
function r5() {
  const h = T.historical_performance_summary;
  const short = l => l.replace('Semester', 'Sem').replace(', AY ', ' · ');
  const worst = [...h].sort((a, b) => b.failure_rate - a.failure_rate)[0];
  const last = h[h.length - 1];
  $('bnCap5').textContent = !h.length ? ''
    : h.length === 1 ? `One period recorded: ${h[0].enrolled} enrolments, failure rate ${pct(h[0].failure_rate)}.`
    : `Failure rate went from ${pct(h[0].failure_rate)} in the first period to ${pct(last.failure_rate)} in the last, peaking at ${pct(worst.failure_rate)} (${worst.period_label}). Enrolments went from ${h[0].enrolled} to ${last.enrolled}.`;
  mk('cHist', h.length ? {
    data: { labels: h.map(p => short(p.period_label)), datasets: [
      { type: 'bar', label: 'Enrolments', data: h.map(p => p.enrolled), backgroundColor: '#c3ccd8', borderRadius: 4, yAxisID: 'y' },
      { type: 'line', label: 'Failure rate', data: h.map(p => +(p.failure_rate * 100).toFixed(1)), borderColor: '#c62b30', backgroundColor: '#c62b30', tension: .25, pointRadius: 4, yAxisID: 'y1' }] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: legend(), tooltip: tt({ label: p => p.dataset.label === 'Failure rate' ? ` Failure rate: ${p.parsed.y.toFixed(1)}%` : ` Enrolments: ${p.parsed.y}` }, ['Pooled over all courses.']) },
      scales: { y: { beginAtZero: true, title: axisT('Enrolments'), ticks: Object.assign({ precision: 0 }, tick), grid }, y1: { position: 'right', beginAtZero: true, title: axisT('Failure rate (%)'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid: { display: false } }, x: { ticks: { font: { size: 9 }, maxRotation: 0, color: '#6b7685' }, grid: { display: false } } } }
  } : null);

  const pp = progRows();
  mk('cProgPerf', pp.length ? {
    type: 'bar',
    data: { labels: pp.map(p => p.program_code), datasets: [
      { label: 'Failure rate', backgroundColor: '#c62b30', borderRadius: 4, data: pp.map(p => +(p.failure_rate * 100).toFixed(1)) },
      { label: 'Repeat share', backgroundColor: '#e3a600', borderRadius: 4, data: pp.map(p => +(100 * p.repeated / p.attempts).toFixed(1)) }] },
    options: { plugins: { legend: legend(), tooltip: tt({ label: p => ` ${p.dataset.label}: ${p.raw}%`, afterBody: it => { const q = pp[it[0].dataIndex]; return [`${q.failed} failed · ${q.repeated} repeated of ${q.attempts} attempts`]; } }) },
      scales: { y: { beginAtZero: true, title: axisT('% of attempts'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid }, x: { ticks: { font: { size: 11 } }, grid: { display: false } } } }
  } : null, 'No program in this filter.');

  const pts = V.rank.filter(r => r.historical_enrolled > 0);
  $('bnCapSc').textContent = pts.length ? `${pts.length} course${pts.length === 1 ? '' : 's'} with recorded attempts. Courses with no attempts yet are not plotted.` : '';
  mk('cSc', pts.length ? {
    type: 'scatter',
    data: { datasets: PRIS.map(p => ({ label: p === 'Routine' ? 'Routine monitoring' : p + ' priority', backgroundColor: PRI_COL[p], pointRadius: 6, pointHoverRadius: 8, data: pts.filter(r => r.priority === p).map(r => ({ x: +(r.historical_failure_rate * 100).toFixed(1), y: +(r.observed_repeat_rate * 100).toFixed(1), r })) })) },
    options: {
      onHover: hov,
      onClick: (_e, els) => { if (els.length) { const e = els[0]; openCourse(ch.cSc.data.datasets[e.datasetIndex].data[e.index].r.course_id); } },
      plugins: { legend: legend(), tooltip: tt({ title: it => { const r = it[0].raw.r; return `${r.course_code} – ${r.course_name}`; }, label: p => ` Failure ${p.raw.x}% · Repeat ${p.raw.y}%`, afterLabel: p => ` Score ${num(p.raw.r.bottleneck_score, 1)}` }, ['Click the dot for the breakdown.']) },
      scales: { x: { title: axisT('Failure rate (%)'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid }, y: { title: axisT('Repeat rate (%)'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid } }
    }
  } : null, 'No course with recorded attempts in this filter.');
}

/* ---------- 2f. APRIORI ITEMSETS (main) + 5d. ASSOCIATION RULES (detail) ---------- */
const chips = ids => ids.map(i => `<span class="bn-chip" title="${esc(nameOf(i))}">${esc(codeOf(i))}</span>`).join(' ');

function r6chart() {
  const items = T.frequent_failed_course_itemsets.filter(i => touch(i.itemsets))
    .sort((a, b) => b.itemset_length - a.itemset_length || b.support - a.support).slice(0, 25);
  const shownItems = items.slice(0, 10);
  $('bnCap6a').textContent = `Top ${shownItems.length} of ${items.length} itemset(s)${scopeOn() ? ' touching the courses in view' : ''}. Red = 2+ courses failed together. Support = share of failed-course transactions.`;
  const itemLabel = i => i.itemsets.map(codeOf).join(' + ');
  mk('cItems', shownItems.length ? {
    type: 'bar',
    data: { labels: shownItems.map(itemLabel), datasets: [{ data: shownItems.map(i => +(i.support * 100).toFixed(2)), backgroundColor: shownItems.map(i => i.itemset_length > 1 ? '#c62b30' : '#22364f'), borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: tt({
        title: it => itemLabel(shownItems[it[0].dataIndex]),
        label: p => ` Support ${p.raw}%`,
        afterLabel: p => ` ${shownItems[p.dataIndex].itemset_length} course${shownItems[p.dataIndex].itemset_length === 1 ? '' : 's'}`
      }, ['Red = sets of 2+ courses failed together.']) },
      scales: { x: { title: axisT('Support (% of failed-course transactions)'), ticks: Object.assign({ callback: v => v + '%' }, tick), grid }, y: { ticks: { font: { size: 10 } }, grid: { display: false } } }
    }
  } : null, 'No frequent itemset for this filter.');
}

function r6rules() {
  const rules = T.failed_course_association_rules.filter(r => touch(r.antecedents.concat(r.consequents))).sort((a, b) => b.lift - a.lift);
  $('bnCap6b').textContent = `${rules.length} rule(s). Read as: students who fail A also fail B. Confidence = how often B follows A; lift above 1 means they co-fail more than chance. Exploratory only: support is low (few co-failures) and association is not causation.`;
  $('bnRules').innerHTML = rules.length ? `<table class="bn-t"><thead><tr><th>If fail (A)</th><th>Also fail (B)</th><th class="n">Support</th><th>Confidence</th><th class="n">Lift</th></tr></thead><tbody>
    ${rules.map(r => `<tr><td>${chips(r.antecedents)}</td><td>${chips(r.consequents)}</td>
      <td class="n">${pct(r.support, 2)}</td><td><span class="bn-bar" style="width:${Math.round(r.confidence * 60)}px"></span>${pct(r.confidence, 0)}</td><td class="n"><b>${num(r.lift, 1)}</b></td></tr>`).join('')}</tbody></table>` : none('No association rule for this filter.');
}

/* ---------- 5e. DETAIL · DATA QUALITY ---------- */
function r7() {
  const v = T.validation_report;
  const pass = v.filter(x => x.passed).length;
  $('bnCap7').innerHTML = `<b class="${pass === v.length ? 'bn-ok' : 'bn-bad'}">${pass} of ${v.length}</b> checks passed${pass === v.length ? '.' : '; review the failed rows.'} Recovered score weights match the exported scores within ${num(D._weightErr, 6)} points.`;
  $('bnVal').innerHTML = `<table class="bn-t"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>
    ${v.map(x => `<tr><td>${esc(x.check)}${x.detail ? `<span class="bn-sub">${esc(x.detail)}</span>` : ''}</td><td class="${x.passed ? 'bn-ok' : 'bn-bad'}">${x.passed ? 'Passed' : 'Failed'}</td></tr>`).join('')}</tbody></table>`;
  const q = Object.fromEntries(T.dataset_quality_overview.map(x => [x.dataset, x]));
  $('bnSchema').innerHTML = `<table class="bn-t"><thead><tr><th>Dataset</th><th class="n">Rows</th><th class="n">Columns</th><th class="n">Duplicates</th><th class="n">Missing</th><th>Schema</th></tr></thead><tbody>
    ${T.schema_validation.map(s => { const o = q[s.dataset] || {}; return `<tr><td><b>${esc(s.dataset)}</b></td><td class="n">${s.rows}</td><td class="n">${s.columns}</td><td class="n">${num(o.duplicate_rows)}</td><td class="n">${num(o.missing_cells)}${o.missing_percent ? ` (${num(o.missing_percent, 1)}%)` : ''}</td><td class="${s.schema_valid ? 'bn-ok' : 'bn-bad'}">${s.schema_valid ? 'Valid' : 'Invalid'}</td></tr>`; }).join('')}</tbody></table>`;
}

/* ---------- 4. ACTION CENTER (each card carries its supporting metrics) ---------- */
function r8() {
  const all = [];
  V.rank.forEach(r => actionsOf(r).forEach((a, i) => all.push({ r, a, cat: recCat(a), id: r.course_id + '-' + i })));
  const recs = all.filter(x => (recP === 'all' || x.r.priority === recP) && (recC === 'all' || x.cat === recC))
    .sort((a, b) => a.r.rank - b.r.rank || (a.id < b.id ? -1 : 1));
  $('bnCap8').textContent = `${recs.length} recommendation(s) for ${uniq(recs.map(x => x.r.course_id)).length} course(s). Rule-based on the evidence flags in the export; they describe what the data shows and are not predictions.`;
  const shown = recs.slice(0, recLimit);
  const m = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  $('bnRecs').innerHTML = shown.map(({ r, a, cat }) => {
    const rel = uniq((SUCC[r.course_id] || []).map(codeOf).concat((PARTNER[r.course_id] || []).map(codeOf)));
    const met = r.historical_enrolled
      ? m(pct(r.historical_failure_rate), 'Failure rate') + m(pct(r.observed_repeat_rate), 'Repeat rate') + m(r.n_failed_students, 'Students with a failure') +
        m(r.direct_successors, 'Direct successors') + m(num(r.bottleneck_score, 1), 'Score') + m(`${r.rank}/${RK.length}`, 'Rank')
      : m('none', 'Attempts recorded') + m(r.direct_successors, 'Direct successors') + m(r.descendants, 'Total successors') + m(num(r.bottleneck_score, 1), 'Score') + m(`${r.rank}/${RK.length}`, 'Rank');
    return `<div class="bn-rec" data-course="${r.course_id}" style="border-left-color:${PRI_COL[r.priority]}">
      <div>${pill(r.priority)} <span class="bn-sub" style="display:inline;margin-left:6px">${esc(cat)}</span></div>
      <h5>${esc(r.course_code)} · ${esc(r.course_name)}</h5>
      <p>${esc(a)}</p>
      <div class="lbl">Supporting metrics${r.historical_enrolled ? '' : ' (no attempts yet; score from course structure only)'}</div>
      <div class="bn-met">${met}</div>
      <div class="meta">${esc(r.program_code)} · Year ${r.year_level}</div>
      ${rel.length ? `<div class="bn-chips">${rel.slice(0, 8).map(c => `<span class="bn-chip">${esc(c)}</span>`).join('')}</div><div class="meta">Related courses (successors, co-failed)</div>` : ''}
    </div>`;
  }).join('') || none('No recommendation for this filter.');
  $('bnMore').style.display = recs.length > recLimit ? '' : 'none';
  $('bnMore').textContent = `Show more (${recs.length - recLimit} left)`;
}

function rLimits() {
  $('bnLimits').innerHTML = [
    'All data in this module is synthetic and generated for demonstration. It is not an actual institutional record.',
    `Bottleneck score = 100 × Σ (weight × component), using five components: ${COMPONENTS.map(c => `${c.t.toLowerCase()} ${pct(c.w, 0)}`).join(', ')}. Priority bands from the export: ${bandTxt()}.`,
    'The export has no withdrawals, per-course period trends, intervention records or student state labels, so those views are not shown. Completion bands (80% or more, 60–79%, below 60%) are a display grouping of each student\'s completion rate, not a prediction.',
    '“Students with a failure” counts students with a recorded failed course in view; the progression data is a sample, so counts describe the sample only.',
    'Courses with no attempts yet (e.g. year-3 courses) are scored from structure only and show no performance data.',
    'Apriori results are exploratory: support is low and association is not causation.'
  ].map(x => `<li>${x}</li>`).join('');
}

/* =====================================================================
   COURSE DETAIL MODAL (score breakdown, performance, downstream impact, actions)
   ===================================================================== */
function openCourse(id) {
  const r = RKID[id];
  if (!r) return;
  const modal = $('bnModal');
  if (modal.style.display !== 'flex') lastFocus = document.activeElement;
  const succ = [...walk([id], SUCC)].filter(x => RKID[x]);
  const prereqs = PREDOF[id] || [];
  const acts = actionsOf(r);
  $('bnModalBox').innerHTML = `<h3 id="bnModalTitle">${esc(r.course_code)} – ${esc(r.course_name)} ${pill(r.priority)}</h3>
    <p class="crumb">SPARTHEON › Course Bottlenecks › ${esc(r.college_name)} › ${esc(r.program_code)} · Year ${r.year_level} · Rank ${r.rank} of ${RK.length}</p>
    <p class="sec-h">Score breakdown ${tip('Each component is scaled 0–1, multiplied by its weight, and summed into the 0–100 score. The bar shows the component value.')} <small>· ${num(r.bottleneck_score, 1)} / 100 · ${esc(r.priority_raw)}</small></p>
    ${COMPONENTS.map((c, i) => `<div class="crit">${c.t} <span style="color:var(--mute)">(weight ${pct(c.w, 0)})</span>: <b>${num(r.pts[i], 1)} pts</b> · component ${num(r[c.f], 2)}<div class="bar"><div style="width:${Math.round(r[c.f] * 100)}%"></div></div></div>`).join('')}
    <p class="bn-fine"><b>Top driver:</b> ${esc(r.top_driver)}</p>
    <p class="sec-h">Performance <small>· all observed periods pooled</small></p>
    <div class="rows">
      <div><span>Attempts</span><i>${r.historical_enrolled ? `${r.historical_enrolled} over ${r.historical_periods} period${r.historical_periods === 1 ? '' : 's'} · ${r.historical_passed} passed · ${r.historical_failed} failed` : 'none recorded yet'}</i></div>
      <div><span>Failure rate</span><i>${pct(r.historical_failure_rate)}</i></div>
      <div><span>Repeat rate</span><i>${pct(r.observed_repeat_rate)} · ${r.repeated_attempts} retakes</i></div>
      <div><span>Course</span><i>${esc(r.course_type || '–')} · ${num(r.units)} units · offered ${esc(r.semester_offered || '–')}</i></div>
    </div>
    <p class="sec-h">Downstream and student impact</p>
    <div class="rows">
      <div><span>Prerequisites</span><i>${prereqs.length ? esc(prereqs.map(codeOf).join(', ')) : 'none (entry course)'}</i></div>
      <div><span>Succeeding courses</span><i>${r.direct_successors} direct · ${r.descendants} total · depth ${r.depth}${succ.length ? ' · ' + esc(succ.map(codeOf).join(', ')) : ''}</i></div>
      <div><span>Students (sample)</span><i>${r.n_failed_students} with a failure · ${r.n_blocked_students} held back from this course by a failed prerequisite</i></div>
      <div><span>Co-failed with</span><i>${esc((PARTNER[id] || []).map(codeOf).join(', ') || 'none found')}</i></div>
    </div>
    <p class="sec-h">Recommended actions <small>· ${acts.length}</small></p>
    ${acts.map(a => `<div class="cm"><b>${esc(recCat(a))}</b><br>${esc(a)}</div>`).join('') || '<p class="none">No recommendation.</p>'}
    <div class="warn n">Synthetic data: results demonstrate the method, not real institutional findings.</div>
    <p style="margin-top:14px"><button class="btn navy" id="bnClose">Close</button> <button class="btn alt" data-focus="${id}">Focus dashboard on this course</button></p>`;
  modal.style.display = 'flex';
  $('bnModalBox').scrollTop = 0;
  $('bnClose').focus();
}
function closeModal() {
  $('bnModal').style.display = 'none';
  if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  lastFocus = null;
}

/* =====================================================================
   EVENTS
   ===================================================================== */
function bind() {
  const refresh = () => { fillFilters(); recLimit = 12; savePrefs(); render(); };
  $('bnCol').onchange = e => { F.col = e.target.value; refresh(); };
  $('bnProg').onchange = e => { F.prog = e.target.value; refresh(); };
  $('bnCourse').onchange = e => { F.course = e.target.value; refresh(); };
  $('bnPri').onchange = e => { F.pri = e.target.value; refresh(); };
  $('bnReset').onclick = () => { F = { col: 'all', prog: 'all', course: 'all', pri: 'all' }; recP = 'all'; recC = 'all'; sel = null; refresh(); };
  $('bnSort').onchange = e => { rankSort = e.target.value; r2(); };
  $('bnMapMode').onchange = e => { mapMode = e.target.value; r3map(); };
  $('bnRecP').onchange = e => { recP = e.target.value; recLimit = 12; r8(); };
  $('bnRecC').onchange = e => { recC = e.target.value; recLimit = 12; r8(); };
  $('bnMore').onclick = () => { recLimit += 12; r8(); };
  $('bnBack').onclick = backToDashboard;
  $('bnNav').onclick = e => {
    const b = e.target.closest('[data-go]');
    if (b) $(b.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('bnCsv').onclick = exportCsv;
  /* open every detail section so the printout is complete, then print */
  $('bnPrint').onclick = () => {
    $('bn').querySelectorAll('details.bn-det').forEach(d => { d.open = true; });
    runDetails();
    requestAnimationFrame(() => { resizeAll(); setTimeout(() => window.print(), 150); });
  };

  /* detail sections draw their charts when opened ('toggle' does not bubble, so use capture) */
  $('bn').addEventListener('toggle', e => {
    const d = e.target;
    if (d && d.classList && d.classList.contains('bn-det') && d.open) {
      runDetail(d.id);
      requestAnimationFrame(resizeAll);
    }
  }, true);

  /* one delegated handler: map nodes, course rows/cards/buttons */
  $('bn').addEventListener('click', e => {
    const node = e.target.closest('.bn-node');
    if (node) { sel = node.dataset.id; r3map(); return; }
    const c = e.target.closest('[data-course]');
    if (c) openCourse(c.dataset.course);
  });
  $('bnModal').addEventListener('click', e => {
    if (e.target === $('bnModal') || e.target.closest('#bnClose')) { closeModal(); return; }
    const f = e.target.closest('[data-focus]');
    if (f) {
      const id = f.dataset.focus, r = RKID[id];
      closeModal();
      F = { col: r.college_code, prog: r.program_code, course: id, pri: 'all' };
      sel = id;
      savePrefs();
      fillFilters();
      render();
      scrollTo(0, 0);
    }
  });

  /* Esc closes; Tab stays inside the dialog */
  document.addEventListener('keydown', e => {
    const m = $('bnModal');
    if (!m || m.style.display !== 'flex') return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const items = [...m.querySelectorAll('button, [href], select, input, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !x.disabled && x.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], act = document.activeElement;
    if (!m.contains(act)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
  });
}

/* BOM so Excel reads UTF-8, CRLF line ends, plus priority label, component points and actions */
function exportCsv() {
  const cols = ['rank', 'course_code', 'course_name', 'college_code', 'program_code', 'year_level', 'bottleneck_score', 'priority',
    'pts_failure', 'pts_repeat', 'pts_recurrence', 'pts_student_impact', 'pts_downstream',
    'historical_failure_rate', 'observed_repeat_rate', 'historical_enrolled', 'n_failed_students', 'n_blocked_students',
    'direct_successors', 'descendants', 'top_driver', 'management_recommendation'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = V.rank.map(r => {
    const o = Object.assign({}, r, { priority: r.priority_raw || r.priority });
    COMPONENTS.forEach((c, i) => { o['pts_' + c.k] = r.pts[i].toFixed(2); });
    return cols.map(c => q(o[c])).join(',');
  });
  const csv = '\ufeff' + [cols.join(',')].concat(rows).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'course_bottleneck_ranking_filtered.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* boot only when the DOM is ready */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectButton);
else injectButton();
window.BN = { open: openModule, close: backToDashboard };   /* optional: BN.open() from the console */
})();