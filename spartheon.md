# SPARTHEON – Central Intelligence Hub

A role-based academic analytics dashboard that turns institutional data into insights for monitoring performance, spotting trends, and making decisions. Built as a single HTML file (HTML, CSS, vanilla JavaScript, Chart.js).

> Sample data only. Portal–SETE integration is a proposed enhancement.

## How to run

1. Put `spartheon-dashboard.html` and `spartheonLogo.jpg` in the same folder.
2. Open `spartheon-dashboard.html` in a browser (internet needed once for the Chart.js CDN).
3. Pick a role on the landing page.

If the logo is missing, the text "SPARTHEON" is shown instead.

## Roles

| Role | Focus | Main visualizations |
|---|---|---|
| Dean | College-wide risk and compliance | Passing rate by year level, risk map, subject heatmap |
| Program Chair | Sections and subjects needing follow-up | SETE response, late-grade matrix, response vs SETE doughnut |
| Faculty Member | My classes and SETE | Class outcomes, SETE trend, SETE per criterion |
| Academic Administrator (VCAA) | Campus-wide quality assurance | College ranking, passing-rate trend per college (2x3), previous vs current high-risk rate |

## Requirements covered

- **5 KPI cards** per role (e.g. Late Grade Rate, SETE Response Rate, High-Risk Course Rate, Passing Rate, SETE Improvement, Teaching Load Compliance). Hover for objective, formula, target, and trend; click to filter the list below.
- **3 visualizations** per role (see table above).
- **Interactive features:** semester / track-or-college / subject filters with Reset, KPI click drill-down, clickable lists and alerts, section detail popup.
- **Alerts:** critical and warning alerts with recommended actions, a notification bell with unread count, and mark as read / mark all as read.
- **Report:** a per-role insights summary with preview and Print / Save as PDF.

## Alert thresholds

| Measure | Warning | Critical |
|---|---|---|
| Late grades | > 5% | > 10%, or late 2 semesters in a row |
| SETE response | < 80% | < 60% |
| High-risk courses | > 10% | > 15% |
| Passing rate | < 85% | < 75% |
| SETE improvement | < 5% | < 0% |
| Teaching load | < 100% | < 90% |

A course is high-risk when failure + dropout is at least 20% and its average SETE is below 3.5.

## Data

Generated in the script (seeded, so it is the same on every load). One row is one subject in one section in one semester. Section code `1106` means Year 1, 1st Sem, Section 06. CICS has 10 IT subjects; the other five colleges (CCJE, CTE, CAS, CHS, CABEIHM) each have their own 5 subjects. To use real data, replace the generator with rows that have the same fields.

## Notes

- SETE results should not be the sole measure of teaching effectiveness; consider response rate, context, and other evidence.
- Read/unread alert status is saved in the browser (localStorage).