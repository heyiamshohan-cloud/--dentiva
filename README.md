# Dentiva 1.0.0

Dentiva is a local-first dental clinic and practice management desktop application designed for Windows x64 clinics in Bangladesh. It combines patient, clinical, appointment, billing, finance, inventory, staff, document, reporting, access-control, audit, and backup workflows in one light-only English/Bengali application.

> Dentiva supports record keeping; it does not diagnose, prescribe, or replace professional clinical judgment. Clinical content is entered and confirmed by an authorised clinician.

## Highlights

- First-run clinic and administrator setup with no default credentials or sample records
- English and Bengali interface, editable Bangladesh/BDT defaults, and bundled offline fonts
- Patient profiles, alerts, chronology, visits, charting for adult and primary teeth, prescriptions, referrals, attachments, and structured treatment plans
- Calendar, appointment conflict checks, daily serial queue, status workflow, and printable slips
- Invoices, discounts, taxes, partial/full payments, refunds, configurable payment methods, receipts, expenses, and reconciled reports
- Treatment catalogue, staff and salary history, inventory, suppliers, stock movements, notifications, and global search
- Branded A4, A5, 58 mm, and 80 mm print/PDF documents
- CSV and XLSX exports with spreadsheet-formula neutralisation
- Local SQLite storage, transactional writes, forward migrations, integrity diagnostics, and append-only audit history
- Verified `.dentivabackup` packages, optional AES-256-GCM encryption, full replacement, and dependency-aware selective restore
- Role-based permissions, inactivity lock, login throttling, PBKDF2-SHA-512 password hashing, and Electron process isolation

## Install on Windows

### Installer

1. Download `Dentiva-1.0.0-x64-nsis.exe` and `SHA256SUMS.txt` from the matching release.
2. Verify its SHA-256 hash (PowerShell):

   ```powershell
   Get-FileHash .\Dentiva-1.0.0-x64-nsis.exe -Algorithm SHA256
   ```

3. Run the installer, choose an installation directory if required, and launch Dentiva.
4. Complete first-run setup. Create a unique administrator password and retain it securely.

The per-user uninstaller is available from Windows **Installed apps** and the Start menu program group. Uninstalling the program does **not** delete clinic data.

### Portable build

Download `Dentiva-1.0.0-x64-portable.exe` or the release ZIP. Keep the portable executable/program folder separate from clinic data. Dentiva stores clinic data in the current Windows user's application-data folder, not beside the executable.

## Data location and privacy

Dentiva is offline-first and does not require an account, cloud service, paid API, analytics service, or internet connection for core workflows. On Windows, operational data is stored under:

```text
%APPDATA%\Dentiva\
├── Database\dentiva.db
├── Attachments\
├── Backups\
├── Branding\
├── Exports\
├── Logs\
└── Temp\
```

Protect the Windows account and device with appropriate access controls, disk encryption, malware protection, physical security, and a tested backup routine. Diagnostic logs intentionally avoid clinical record contents, but they should still be handled as private operational files.

## Backup essentials

- Create a verified backup regularly from **Settings → Backup & restore**.
- Prefer encryption when the backup leaves the clinic-controlled device.
- Store the password separately; Dentiva cannot recover a forgotten backup password.
- Keep at least one copy on a different protected device/location.
- Use **Verify** and periodically rehearse restoration on an authorised test workstation.
- Full restore is restricted to the same clinic workspace. Selective restore previews counts, dependencies, patients, and duplicate handling before import.

See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for the complete runbook.

## Build from source

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Windows x64 for producing and validating the supported release artifacts

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:windows
```

The Windows package command creates NSIS and portable targets through `electron-builder`. Release automation is defined in `.github/workflows/release-windows.yml` and performs clean installation, security audit, checks, tests, build, packaging, checksums, and artifact upload on `windows-latest`. A second clean Windows runner downloads that upload and independently repeats checksum, manifest, installer/uninstaller, portable executable, and extracted-ZIP verification before release publication is allowed.

Useful commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Run Vite and watch the Electron main process |
| `npm run typecheck` | Check renderer, shared, preload, and main-process TypeScript |
| `npm run lint` | Run the source/test linter |
| `npm test` | Run integration, security, migration, restore, export, localisation, and performance tests |
| `npm run build` | Create production renderer/main output |
| `npm run pack:windows` | Build Windows x64 NSIS and portable packages |
| `npm run release` | Stage release files and generate SHA-256 sums after packaging |

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Backup and recovery](docs/BACKUP_AND_RECOVERY.md)
- [Security and privacy](docs/SECURITY.md)
- [Deployment and release verification](docs/DEPLOYMENT.md)
- [Changelog](CHANGELOG.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Dentiva licence](LICENSE.txt)

## Support and credits

**Built by Md. Shohan Khan**<br>
Email: [helloiamshohan@gmail.com](mailto:helloiamshohan@gmail.com)<br>
WhatsApp: `01516591935`

When requesting support, include the Dentiva version, Windows version, a concise description, and the relevant diagnostics summary. Never send a production database, attachment, password, or decrypted backup unless a clinic-authorised secure process has been agreed.

Copyright © 2026 Md. Shohan Khan. All rights reserved. See [LICENSE.txt](LICENSE.txt).
