# Security and Privacy

## Scope

Dentiva is a single-workstation/local-data desktop application. It supplies technical controls but cannot establish a clinic's full privacy, consent, retention, incident-response, or regulatory programme. The clinic remains responsible for lawful use, professional review, device security, staff training, physical controls, backups, and access governance.

## Security architecture

- **Authentication:** no default credentials; passwords are salted with 32 random bytes and derived with PBKDF2-SHA-512 at 310,000 iterations.
- **Login defence:** constant-work unknown-user handling, failed-attempt tracking, and a 15-minute account lock after five failures.
- **Sessions:** 256-bit random in-memory tokens, configurable inactivity lock, 12-hour absolute limit, explicit lock/logout, and other-session revocation after password change.
- **Authorisation:** permission checks are enforced in the Electron main process at each IPC boundary; renderer visibility is not treated as security.
- **Audit:** append-only database triggers prevent alteration/deletion of audit rows. Authentication, permission, clinical, financial, restore, export, print, and administrative actions are attributable.
- **Data integrity:** foreign keys, check constraints, indexes, transactions, forward schema migrations, startup safety snapshots, integrity checks, and reconciliation fields.
- **Process isolation:** context isolation and sandboxing are enabled, Node integration is disabled in the renderer, navigation/window creation is restricted, and browser permissions are denied by default.
- **Attachments:** files remain outside SQLite, managed paths reject traversal, metadata stores SHA-256 and size, and viewing uses a session-authorised local protocol.
- **Backups:** per-file SHA-256 manifest verification; optional authenticated AES-256-GCM encryption with PBKDF2-SHA-512 (310,000 iterations); constrained ZIP extraction; staging and rollback.
- **Exports:** user-initiated, permission-controlled, audited, and CSV/XLSX cells that can trigger spreadsheet formulas are neutralised.
- **Network:** no cloud/API is required for core operation and no telemetry/analytics client is included.

## Important limitations

- The live SQLite database and attachment directory are not application-encrypted at rest. Use Windows device encryption/BitLocker or equivalent, a strong Windows account, and protected backups.
- A user/process with full Windows filesystem or administrator access can potentially read/copy local clinic data outside Dentiva's role model.
- Exported PDFs, spreadsheets, CSVs, printed documents, and decrypted backups are outside Dentiva's control after creation.
- Backups are encrypted only when the operator explicitly supplies a backup password.
- Dentiva does not provide network multi-user locking or cloud replication. Do not place the live database on a shared/synchronised network folder.
- Code signing depends on the release publisher's certificate. An unsigned build can trigger Windows SmartScreen and does not provide publisher identity assurance.

## Deployment baseline

1. Use a supported, fully patched Windows x64 installation.
2. Restrict the Windows account to authorised clinic staff and enable full-disk encryption.
3. Use endpoint protection, automatic screen lock, secure boot where available, and a UPS for unreliable power.
4. Install only a hash-verified release obtained from the authorised distribution location.
5. Give each person a separate Dentiva account and least-privilege role.
6. Set a short practical inactivity timeout.
7. Keep clinic data and backups out of consumer sync folders unless the clinic has approved that data processor and configuration.
8. Review users, roles, failed logins, exports, restores, refunds, and audit history on a defined schedule.
9. Test backup recovery and printer/PDF output before production use.

## Sensitive-data handling

- Do not enter unverified diagnoses, advice, or prescription instructions.
- Minimise free-text content to information needed for care and operations.
- Confirm the patient before every visit, attachment, plan, invoice, prescription, and export.
- Archive rather than silently deleting history.
- Send exports only through clinic-approved secure channels.
- Dispose of printed records and retired storage according to clinic policy and applicable law.

## Logging

Logs contain operational events and error context, not intentionally logged passwords, backup keys, session tokens, or full clinical records. Nevertheless, hostnames, paths, versions, identifiers, and exception context can be sensitive. Inspect before sharing and use an approved secure support channel.

## Reporting a security issue

Email **helloiamshohan@gmail.com** with:

- Dentiva version and Windows version;
- impact and reproducible steps;
- non-sensitive logs or proof;
- whether patient/clinic data may be affected.

Do not include real patient data, passwords, session tokens, databases, attachments, or decrypted backups in an initial report. Allow reasonable time for investigation before public disclosure.

## Cryptographic implementation note

Dentiva uses cryptographic implementations supplied by the supported Node.js/Electron runtime. Algorithms and iteration counts are documented for auditability; organisations with mandated cryptographic standards should independently assess the build and deployment before use.
