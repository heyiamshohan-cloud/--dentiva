# Changelog

All notable Dentiva release changes are recorded here. Dates use ISO 8601.

## [1.0.0] — 2026-09-21

Initial production release.

### Clinic and access

- Added guided first-run clinic/administrator setup with editable Bangladesh, BDT, currency symbol, language, date, numbering, and document defaults.
- Added local authentication, strong salted password derivation, lockout, inactivity/absolute session expiry, manual lock, password change, users, built-in/custom roles, granular permissions, and append-only audit history.
- Added light-only responsive English/Bengali interface, keyboard shortcuts, global search, notifications, diagnostics, and About/credits.

### Patients and clinical care

- Added patient registration, profile editing, medical alerts, tags, favourites, search, pagination, archive/restore, balances, and longitudinal record views.
- Added clinical visits, chronology, diagnoses, procedures, adult/primary dental chart entries, prescriptions, referrals, attachments/X-ray viewing, and branded summaries.
- Added structured treatment catalogue/plans with catalogue or custom lines, tooth/surface context, quantities, estimates, discounts, controlled plan/item statuses, retained cancellation history, and immutable completed/cancelled plans.

### Operations and finance

- Added appointment calendar/list views, overlap protection, daily serial queue, status changes, and appointment slips.
- Added itemised invoices, tax/discount calculations, partial and full payments, configurable payment methods, bounded refunds, patient balance reconciliation, receipts, and financial reporting.
- Added expenses with void history, suppliers, inventory items, transactional stock movements, minimum-stock notifications, staff records, and effective-dated salary history.

### Documents, exports, and resilience

- Added branded English/Bengali invoice, receipt, prescription, patient summary, visit summary, appointment slip, and referral output for A4, A5, 58 mm, and 80 mm paper/PDF workflows.
- Added CSV/XLSX/PDF reporting exports with spreadsheet-formula neutralisation.
- Added relational SQLite schema/migrations, indexes, transaction boundaries, startup migration safety copies, WAL/checkpoint handling, integrity/foreign-key diagnostics, and managed file storage.
- Added SHA-256 verified `.dentivabackup` packages, optional AES-256-GCM encryption, constrained streaming extraction, preview/counts/date bounds, patient/module selection, dependency mapping, skip/update/copy strategies, full same-clinic replacement, staging, rollback, and restore audit records.

### Packaging and assurance

- Added Windows x64 NSIS and portable packaging, installer/uninstaller identity, application icons, bundled English/Bengali fonts, documentation, third-party notices, release checksums, and CI release workflow.
- Added automated tests covering critical workflows, RBAC/audit, localisation, document escaping, migration, reconciliation, exports, backup/restore/rollback, and indexed large-data behaviour.
