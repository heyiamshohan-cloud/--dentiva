# Backup and Recovery Runbook

This procedure is for an authorised clinic administrator. A restore can replace or import sensitive clinical and financial records. Schedule it during downtime and keep an independent current backup first.

## What a Dentiva backup contains

A `.dentivabackup` package contains:

- a transactionally consistent SQLite snapshot;
- managed attachments and clinic branding files;
- a manifest with application/schema versions, clinic identity, file sizes, record counts, and SHA-256 hashes.

Optional encryption uses AES-256-GCM. The encryption key is derived with PBKDF2-SHA-512 and a random salt. Every restore/verify operation checks archive paths, manifest completeness, file hashes, SQLite integrity, and foreign keys before importing.

## Create and verify

1. Ensure pending clinic work is saved.
2. Open **Backup & restore** with a user permitted to create backups.
3. Choose a destination on a clinic-controlled drive.
4. Enable encryption when the file may leave the secured workstation. Use a unique password of at least 10 characters.
5. Choose **Create backup** and wait for status **Verified**.
6. Keep the displayed file, size, time, and checksum in the clinic backup log.
7. Use **Verify backup** against the copied file—not only the original—to detect transfer/storage damage.

Dentiva cannot recover a forgotten encryption password. Do not store the password in the same folder/device as the only backup.

## Rotation recommendation

Adapt this to clinic policy and legal requirements:

- daily protected backup while the clinic is operating;
- multiple recent daily generations;
- weekly and monthly generations retained separately;
- at least one offline or physically separate encrypted copy;
- periodic restore rehearsal on an authorised non-production workstation.

Do not depend on a single USB drive or on the workstation's internal disk.

## Analyse before restore

1. Select the package and supply its password if encrypted.
2. Dentiva verifies it before showing content.
3. Review source application version, package version, date, record counts, patient list, and date bounds.
4. Confirm the source clinic and intended destination.
5. Stop and retain evidence if verification fails. Do not repeatedly force a damaged package into production.

## Selective restore

Use selective restore to bring chosen modules/patients into the current clinic while preserving the workspace.

1. Select modules and, when applicable, explicit patients.
2. Include required dependencies. For example, patient-linked visits, plans, invoices, payments, prescriptions, and attachments require resolvable patients; related records may also require visits, staff, catalogue items, or invoices.
3. Choose a duplicate strategy:
   - **Skip**: preserve the destination item when a matching identity/code already exists.
   - **Update**: update a matching destination record while retaining its destination identity.
   - **Copy**: generate a new identity/code and import another copy.
4. Review the final summary and start restore.

Selective restore runs database writes in a transaction. Files are staged before commit. If any database or file step fails, database changes roll back and replaced/copied files are restored or removed. Dentiva records the import job outcome.

Afterward:

- run Diagnostics integrity/foreign-key checks;
- review imported counts and skipped counts;
- inspect representative patients and every affected financial balance;
- verify attachments open;
- retain the pre-restore backup and import record.

## Full workspace restore

Full restore is intentionally limited to a backup whose clinic identity matches the current workspace and whose schema version is supported by this Dentiva version. Use selective restore for a different clinic.

1. Create and verify a fresh backup of the current workspace.
2. Ensure all other Dentiva windows/users are closed.
3. Select **Complete workspace replacement**.
4. Enter the explicit confirmation phrase shown by Dentiva.
5. Start restore and do not interrupt power or storage.

Dentiva stages attachments/branding, creates rollback copies, replaces the database, and performs final integrity checks. If a checked step fails, it attempts to put back the database and managed files. Safety copies are retained when automatic cleanup/rollback cannot complete.

A full restore returns the workspace to the state captured by the backup. Credentials and user accounts from that backup become active. Know a valid administrator login from the backup before proceeding.

## Post-restore verification

Document these checks:

1. Dentiva launches and accepts an authorised backup-era credential.
2. Diagnostics show `ok` database integrity and no foreign-key violations.
3. Clinic identity, numbering settings, branding, and language are correct.
4. Patient and date-bound record counts agree with the preview.
5. Representative recent/older patient histories, chart entries, prescriptions, and plans are correct.
6. Representative invoices satisfy `total = paid + outstanding` after refunds.
7. Expenses, reports, inventory on-hand totals, salary history, and appointment serials are coherent.
8. Representative attachments/X-rays open and hashes/files are present.
9. A newly created post-restore verified backup succeeds.

## Recovery when Dentiva cannot start

1. Do not edit, rename, or overwrite `dentiva.db` manually.
2. Copy the entire `%APPDATA%\Dentiva` folder to protected storage as incident evidence.
3. Note the exact message and Windows/application version.
4. Check `Logs` for the startup time without sharing patient files.
5. Contact support with non-sensitive diagnostic details.
6. Restore only through a known-good Dentiva build and verified package under an authorised recovery plan.

## Password and media loss

- Lost encryption password: there is no back door; locate another verified backup.
- Lost/corrupt backup media: preserve the media, try another verified generation, and investigate the storage process.
- Suspected unauthorised disclosure: isolate copies, follow clinic/legal incident procedures, review audit and Windows access evidence, and rotate affected credentials.
