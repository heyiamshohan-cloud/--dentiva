# Windows Deployment and Release Verification

## Supported target

- Dentiva 1.0.0
- Windows 10/11 x64
- Per-user NSIS installation or x64 portable executable
- Local fixed-disk application data under `%APPDATA%\Dentiva`

Dentiva is not designed for a live SQLite database on SMB/NAS, OneDrive, Dropbox, or another synchronised/shared folder.

## Clean release build

The authoritative CI path is `.github/workflows/release-windows.yml` on GitHub-hosted `windows-latest`.

Local Windows equivalent:

```powershell
node --version
npm --version
npm ci
npm audit --omit=dev --audit-level=moderate
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:windows
npm run release
```

`npm run release` validates expected artifacts, copies release documentation, creates the portable directory ZIP, and writes SHA-256 sums. A failed command blocks release. The release workflow then downloads the uploaded bundle on a separate clean Windows runner, recomputes its hashes and manifest, and repeats installer, uninstaller, portable executable, and extracted-ZIP startup checks. A maintainer can publish that independently verified bundle with the workflow’s explicit `publish_release` dispatch option.

## Expected artifact set

```text
release/artifacts/
├── Dentiva-1.0.0-x64-nsis.exe
├── Dentiva-1.0.0-x64-portable.exe
├── Dentiva-1.0.0-windows-x64-portable.zip
├── SHA256SUMS.txt
├── RELEASE_MANIFEST.json
├── README.md
├── USER_GUIDE.md
├── BACKUP_AND_RECOVERY.md
├── SECURITY.md
├── CHANGELOG.md
├── LICENSE.txt
└── THIRD_PARTY_NOTICES.md
```

The unpacked `dist/win-unpacked/Dentiva.exe` is included in the portable ZIP, along with its runtime files. Do not distribute a lone unpacked executable without those files.

## Pre-release acceptance checklist

Record operator, time, Windows build, display/scaling, printer, artifact hashes, and results.

### Automated gates

- clean `npm ci` from the lockfile;
- production dependency audit reports no known vulnerability at the configured threshold;
- TypeScript checks pass;
- lint passes;
- all automated tests pass, including fresh setup, authentication/RBAC, critical workflows, salary history, treatment plan lifecycle, migration, backup encryption/verification/selective restore/full rollback, exports, localisation/document rendering, and large data;
- production renderer/main build passes;
- NSIS, portable executable, and unpacked app package successfully;
- release script finds non-empty expected binaries and emits valid SHA-256 hashes.

### Windows runtime smoke test

Use a fresh Windows user or disposable VM; do not use real patient data.

1. Verify all hashes against `SHA256SUMS.txt`.
2. Launch `dist\win-unpacked\Dentiva.exe`; confirm one window opens and no startup error appears.
3. Complete first-run setup with synthetic QA-only values, then restart and sign in.
4. Verify no sample patients, staff, money, appointments, clinical records, invoices, or dashboard statistics exist.
5. Exercise the acceptance workflow below.
6. Close/reopen after database writes and verify persistence/integrity.
7. Launch the portable executable separately under a clean Windows user and repeat setup/startup basics.

### Functional acceptance workflow

Using clearly synthetic QA records:

1. Create restricted and administrative user roles; verify denied actions are blocked/audited.
2. Register/edit/archive/restore a patient.
3. Create/reschedule/check in/complete an appointment; verify conflict and serial behaviour.
4. Create a visit, chart adult and primary teeth, create/present/accept/complete a plan, add a prescription/referral and attachment; verify completed plan immutability.
5. Create an invoice, partial/final payments and refund; verify totals and patient balance.
6. Add/void expense and reconcile reports.
7. Add supplier/item and stock movements; verify on-hand and low-stock notice.
8. Add staff, change salary with effective metadata, and verify both history periods.
9. Export CSV/XLSX/PDF and inspect content.
10. Create an encrypted backup, verify it, test wrong password, test selective restore rollback and full restore on a QA copy.
11. Review audit and Diagnostics.

### Visual, language, and accessibility matrix

Manually inspect at minimum:

- 1366×768 at 100% scale;
- 1920×1080 at 100% and 125%;
- 2560×1440 at 150%;
- smallest supported app window (1080×700);
- English and Bengali on every primary page/dialog;
- keyboard-only navigation, visible focus, `Ctrl+K`, `Ctrl+L`, `Esc`, form labels, modal focus behaviour, and readable disabled/error states;
- empty, loading, success, warning, validation, permission-denied, and failure states;
- long names/addresses, large BDT amounts, scrollable tables, and pagination.

### Print/PDF matrix

From both English and Bengali records verify:

- invoice: A4 and A5;
- receipt: 58 mm and 80 mm;
- prescription: A4/A5;
- patient and visit summaries;
- appointment slip;
- referral letter;
- logo, clinic identity, footer, numbering, BDT formatting, Bengali glyph shaping, page breaks, margins, and print preview;
- physical print on configured office printer where available.

### Installer/uninstaller test

1. Run NSIS installer as a standard Windows user.
2. Review the licence, choose a non-default allowed path, complete installation, and check Start/Desktop shortcuts.
3. Launch installed Dentiva and complete the smoke workflow.
4. Install the same version over it; verify the program updates without deleting `%APPDATA%\Dentiva`.
5. Uninstall through **Installed apps**.
6. Verify program binaries/shortcuts are removed and clinic data remains.
7. Reinstall and verify the retained workspace starts and passes Diagnostics.

## Signing and reputation

The project can build unsigned artifacts without secrets. For commercial distribution, sign both installer and executable with an organisation-controlled Windows code-signing certificate in a protected CI signing step. Never commit certificates or passwords. After signing, regenerate hashes and rerun installation/runtime verification.

## Rollback deployment

Before upgrading a production workstation:

1. create and verify a Dentiva backup;
2. copy it to separate protected storage;
3. record the current installer/version and hash;
4. close Dentiva;
5. install the new version and run Diagnostics plus a representative workflow.

If validation fails, preserve logs/data, stop writes, and follow the authorised recovery runbook. Do not copy an older application binary over a database after a schema migration unless that downgrade path has been explicitly tested.
