# Product Requirements and Delivery Summary

## Mirsad Security Awareness and Phishing Reporting System

**Document type:** Product requirements and completed delivery summary  
**Delivery approach:** Agile, organized into five sprints  

## 1. Product Overview

Mirsad is a web-based security awareness and phishing reporting system. It supports employee training, simulated phishing awareness campaigns, suspicious email intake, security analysis workflows, and management reporting.

## 2. Product Goals

- Improve employee awareness of phishing and social engineering through courses and quizzes.
- Allow training administrators to prepare awareness campaigns and review their results.
- Provide a workflow for receiving and reviewing suspicious email reports.
- Present training and campaign metrics to support awareness planning.

## 3. User Roles

- **Employee:** Access courses, quizzes, certificates, personal training progress, and personal phishing simulation results.
- **administrator:** Manage courses, quizzes, campaigns, campaign statistics ,Review submitted email reports and run available email and domain analysis tools.

## 4. Functional Requirements Delivered

### Training and Assessment

- Display active training courses to employees.
- Allow authorized administrators to create courses and manage their quiz questions.
- Support multiple-choice assessments and calculate employee scores.
- Record course progress and completion status.
- Issue certificates when employees meet the configured passing score.
- Provide employee pages for training paths, achievements, certificates, and statistics.

### Awareness Campaigns

- Create and save phishing awareness campaigns as drafts or scheduled campaigns.
- Assign campaigns to a target department.
- Preview eligible recipients before campaign delivery.
- Send test email through SMTP to a specifically allowlisted test address.
- Send authorized campaigns through SMTP after explicit administrator confirmation.
- Include a unique awareness link in each campaign email.
- Record campaign sends, link clicks, and reports.
- Display aggregated campaign metrics by department and the employee's own simulation result in the employee portal.
- Show an awareness landing page after an employee opens the campaign link; it does not request or collect credentials.

### Suspicious Email Reporting and Analysis

- Receive email reports through an n8n workflow and a protected Django webhook.
- Store report subject, sender, body, date, headers, and available raw email content.
- Display submitted reports in the security dashboard.
- Support analysis of suspicious email content and public domains with available project tools.
- Support domain checks through PHISH_HUNTER_PRO and account presence checks through Holehe.
- Use VirusTotal in the n8n workflow to check extracted domains and IP addresses.
- Classify messages using phishing-related language and link context before passing them to the analysis and reporting stages.
- Include classification reasons and scan summaries with the report data.

### Dashboards and Reporting

- Provide a security dashboard for email reports and analysis activity.
- Present system statistics using charts.
- Present employee-specific training, achievement, and certificate statistics.
- Present phishing campaign statistics as department-level aggregates.

## 5. Five-Sprint Agile Delivery Plan

### Sprint 1 — Platform Foundation and Access Control

**Sprint goal:** Establish the core application foundation and role-based access.

**Delivered:**

- Django backend and React frontend structure.
- PostgreSQL data model for users and departments.
- Employee, trainer, analyst, and administrator roles.
- Login and protected access to employee and administrator pages.
- User activation and department assignment support.

### Sprint 2 — Employee Training and Assessment

**Sprint goal:** Deliver the employee learning and assessment experience.

**Delivered:**

- Course listing and training path pages.
- Administrative course and quiz management.
- Multiple-choice quiz submission and scoring.
- Training progress and course completion records.
- Certificate creation and employee certificate pages.

### Sprint 3 — Awareness Campaigns and SMTP Delivery

**Sprint goal:** Prepare and deliver authorized phishing awareness campaigns.

**Delivered:**

- Campaign creation, department targeting, draft and scheduled statuses.
- Recipient preview and explicit confirmation before campaign delivery.
- SMTP configuration and test email delivery.
- Campaign delivery to eligible employee accounts in the selected department.
- Unique awareness link generation and click recording.
- Campaign metrics for sent messages, clicks, and reports.

### Sprint 4 — Email Reporting and Security Analysis

**Sprint goal:** Connect email intake and initial analysis workflows.

**Delivered:**

- n8n to Django webhook integration for email reports.
- IMAP-based email intake workflow.
- Message parsing and extraction of links, domains, IPs, and authentication signals.
- VirusTotal indicator lookup.
- Integration of PHISH_HUNTER_PRO, Holehe, and the phishing email analyzer in analyst workflows.
- Initial suspicion filtering before messages proceed to report delivery.

### Sprint 5 — Dashboards, Privacy, and End-to-End Awareness Results

**Sprint goal:** Present training and campaign outcomes to employees and administrators.

**Delivered:**

- Security dashboard and chart-based system statistics.
- Employee achievement and certificate statistics.
- Aggregated campaign metrics by department.
- Employee-specific phishing simulation results in the training portal.
- Anonymous tracking tokens for campaign interaction links.
- Awareness page that records a click without collecting credentials.
- Database migrations for campaign tracking and simulation results.

## 6. Data Model Summary

The PostgreSQL schema supports the following entities:

- **Users and Departments:** User accounts, roles, activation state, and department membership.
- **Courses and Questions:** Training content and related quiz questions.
- **Training Progress and Certificates:** Employee progress, scores, completion, and issued certificates.
- **Phishing Campaigns:** Campaign content, target department, schedule, and status.
- **Campaign Metrics:** Department-level totals for sent messages, clicks, and reports.
- **Campaign Tracking Tokens:** Per-message random tokens stored as hashes for click and report tracking.
- **Simulation Results:** Employee-visible outcomes for campaign interactions.
- **Phishing Reports and Scan Reports:** Submitted email data and analysis outputs.

## 7. Privacy and Security Measures Delivered

- Campaign dashboards show aggregate department metrics.
- Campaign metric records do not contain employee identifiers.
- Employees can view their own simulation results in their authenticated portal.
- Campaign click tokens are random, and only their hashes are stored.
- The awareness landing page does not ask for or collect passwords or login details.
- Campaign sending is restricted to eligible employees in the selected department and configured recipient allowlists.
- Campaign launch requires an administrator's explicit confirmation.
- Mailpit is available for local email testing without external delivery.

## 8. Technology Summary

- **Frontend:** React.
- **Backend:** Django and Django REST Framework.
- **Database:** PostgreSQL.
- **Automation:** n8n with IMAP intake and Django webhook delivery.
- **Email:** SMTP for test and campaign messages; Mailpit for local testing.
- **Analysis tools:** VirusTotal, PHISH_HUNTER_PRO, Holehe, and the phishing email analyzer.

