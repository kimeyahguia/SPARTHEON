# SPARTHEON – Central Intelligence Hub

**Empowering Spartans Through Intelligence.**

SPARTHEON is a centralized university analytics dashboard. It turns institutional data, such as grades, SETE results, and teaching loads, into insights that help academic leaders monitor performance, spot trends, and make informed decisions.

> Sample data only. Portal–SETE integration is a proposed enhancement.

## Purpose

- Show the status of key academic measures in one place instead of scattered reports.
- Flag problems early (late grades, low SETE response, low passing rates, high-risk courses).
- Give each role only the information it needs to act.

## Users and the decisions they support

| Role | Decision supported | Main visualizations |
|---|---|---|
| Dean | Which tracks and subjects need curriculum or faculty support | Passing rate by year level, risk map, subject heatmap |
| Program Chair | Which sections and subjects need follow-up now | SETE response, late-grade matrix, response vs SETE |
| Faculty Member | How my classes stand and what to improve | Class outcomes, SETE trend, SETE per criterion |
| Academic Administrator (VCAA) | Which colleges need curriculum review, tutoring funds, and faculty development | College ranking, passing-rate trend per college, previous vs current high-risk rate |

## Key features

- **5 KPI cards per role** with objective, formula, target, and trend vs the previous semester.
- **3 visualizations per role**, chosen for the decisions that role makes.
- **Filters** by semester, track or college, and subject.
- **Drill-down:** selecting a KPI lists the sections behind it; selecting a section opens its details.
- **Alerts:** critical and warning alerts, each with a recommended action. A notification bell counts unread alerts, and alerts can be marked as read.
- **Insights report:** a summary per role that can be previewed, printed, or saved as PDF.

## Key performance indicators

| KPI | Target |
|---|---|
| Late Grade Submission Rate | ≤ 5% |
| SETE Response Rate per Section | ≥ 80% |
| High-Risk Course Rate | ≤ 10% |
| Student Passing Rate per Subject | ≥ 85% |
| Faculty SETE Improvement Rate | ≥ 5% |
| Teaching Load Compliance Rate | 100% |

A course is **high-risk** when failure + dropout is at least 20% and its average SETE is below 3.5.

## Alert rules

| Measure | Warning | Critical |
|---|---|---|
| Late grades | > 5% | > 10%, or late 2 semesters in a row |
| SETE response | < 80% | < 60% |
| High-risk courses | > 10% | > 15% |
| Passing rate | < 85% | < 75% |
| SETE improvement | < 5% | < 0% |
| Teaching load | < 100% | < 90% |

## Data coverage

Four semesters of sample data. Each record is one subject in one section in one semester. CICS has 10 IT subjects (core, Business Analytics, and Networking tracks); CCJE, CTE, CAS, CHS, and CABEIHM each have 5 subjects of their own.

## Responsible use

SETE results should not be the sole measure of teaching effectiveness. Response rate, context, and other evidence should be considered. Sections with low response rates are flagged for cautious interpretation.
