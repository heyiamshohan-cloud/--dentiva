# Dentiva 1.0.0 User Guide

## 1. Start safely

On first launch Dentiva opens clinic setup. Enter the clinic identity, dentist/professional details, address, phone, locale, currency, document numbering, and administrator account. Bangladesh, BDT, and `৳` are defaults and remain editable.

There are no default credentials. Use a unique password of at least 10 characters with a strong mix of letters, numbers, and symbols. Record it using the clinic's approved password-management procedure.

After setup, sign in with the administrator username and password you created. Dentiva automatically locks inactive sessions according to **Settings → Application → Automatic lock**. `Ctrl+L` locks immediately.

## 2. Navigation and keyboard access

The left navigation gives permission-controlled access to Dashboard, Patients, Appointments, Clinical, Billing, Finance, Inventory, Staff, Reports, Backup, and Settings.

- `Ctrl+K`: global search
- `Ctrl+L`: lock Dentiva
- `Esc`: close the active dialog or overlay
- `Tab` / `Shift+Tab`: move through controls
- `Enter` / `Space`: activate the focused control

Screen content adapts to supported window widths. Dentiva intentionally uses a light clinical colour scheme only.

## 3. Patients

### Register a patient

1. Open **Patients** and choose **New patient**.
2. Enter the patient's confirmed identity and contact details.
3. Record medical alerts, allergies, medicines, conditions, and consent-related notes only from verified information.
4. Save. Dentiva assigns the next clinic patient number transactionally.

Open a patient to view demographics, balances, appointments, clinical history, invoices, attachments, and related records. Editing a profile does not erase clinical chronology. Archiving hides an inactive record from routine lists without deleting its history; authorised users can restore it.

Use medical-alert fields for concise, clinically relevant warnings. Dentiva displays those warnings but does not interpret them.

## 4. Appointments and serial queue

1. Open **Appointments** and choose a date/view.
2. Add an appointment, select a patient and clinician, then enter start/end times and a reason.
3. Resolve any detected clinician or chair/time conflict before saving.
4. On the clinic day, update the appointment through checked-in, in-chair, completed, cancelled, or no-show states as appropriate.

The daily serial is generated per clinic day. Rescheduling and status changes are retained in audit history. Print an appointment slip from the record when required.

## 5. Clinical records

### Visits

Start a visit only after choosing the correct patient. Enter the clinician-confirmed complaint, history, findings, diagnosis, treatment, notes, and follow-up. A completed visit remains part of the chronology; correction should be made through an attributable follow-up/update rather than silent deletion.

### Dental chart

Choose adult or primary dentition, then select a tooth/surface and a factual chart status. Every chart entry is patient- and visit-linked. Confirm the patient and tooth before saving.

### Treatment plans

1. Open **Clinical → Treatment plans** and select a patient.
2. Add catalogue items or a clearly described custom item.
3. Set quantity, clinician estimate, discount, tooth/surface where relevant, and item status.
4. Save as draft, present it, record acceptance, begin work, and complete it only when clinically confirmed.

Completed or cancelled plans are read-only. Removing an existing line from an editable plan retains it as cancelled rather than destroying history. Estimates are not invoices and require clinician/patient review.

### Prescriptions

Prescriptions are clinician-authored. Enter each medicine, dosage, frequency, duration, and instructions exactly as confirmed by the responsible clinician. Dentiva does not recommend medicines or doses. Preview the output before printing/PDF export.

### Referrals

Record the destination, receiving provider, reason, response, outcome, and dates based on the actual referral. Use the branded referral print/PDF action for handover.

### Attachments and X-rays

Attachments are copied into managed storage instead of being embedded in SQLite. Confirm patient/category before import. The viewer uses a restricted local media route. Archive obsolete entries rather than manually deleting files from the data folder.

## 6. Billing and payments

### Invoice

1. Open **Billing**, choose the patient, and add confirmed service lines.
2. Review quantities, fees, discounts, and tax.
3. Save/issue the invoice. Totals and patient outstanding balance are calculated transactionally.
4. Preview or print the branded invoice.

### Payment

Open the invoice and add a payment with date, amount, configured method, and optional reference. Partial and full payments are supported. Dentiva will not accept a payment that exceeds the current amount due.

### Refund

Use the explicit refund action when authorised. A refund references an existing payment and cannot exceed the refundable amount. It is recorded separately; it does not erase the original payment. Preview/print a receipt for the correct transaction.

Payment methods can be configured in **Settings → Application**. Existing historical records retain the method text used at the time.

## 7. Finances and reports

Use **Finance** to record clinic expenses with date, category, payee, amount, payment method, and reference. Void an incorrect expense with a reason; do not attempt to remove financial history.

Reports derive from recorded transactions and offer date filtering. Revenue, collections, refunds, expenses, receivables, treatment activity, appointments, patients, and inventory reports are permission-controlled. CSV and XLSX exports neutralise values that spreadsheet programs might otherwise interpret as formulas. PDF exports use local print rendering.

Always reconcile Dentiva totals with cash, bank/mobile-wallet statements, issued invoices, receipts, refunds, and authorised expense evidence according to clinic policy.

## 8. Inventory and suppliers

Create suppliers and inventory items with units, minimum levels, cost/sale values, and expiry/batch details where relevant. Stock is changed through movements (receive, use, adjust, return), preserving the movement ledger. Low-stock notifications appear when on-hand stock reaches the configured minimum.

## 9. Staff, salaries, users, and roles

Staff records and login accounts are separate. A staff record can carry employment/contact information and salary history. Changing salary creates a new effective history row and closes the prior period; it does not overwrite the earlier amount.

Under **Settings → Users & roles**, authorised administrators can:

- create/disable user accounts;
- reset passwords;
- assign built-in or custom roles;
- grant only the permissions required for the person's duties.

Never share accounts. Review access and remove unneeded permissions promptly. Changes and denied permission attempts are audited.

## 10. Branding, printing, and language

Clinic name, contact details, dentist identity, logo, footer, numbering prefixes, default language, date format, currency, receipt width, and related behaviour are configurable in Settings.

Documents support English or Bengali and A4, A5, 58 mm, or 80 mm output as applicable. Always inspect print preview, selected printer, paper, margins, logo, totals, patient identity, and Bengali glyph output before handing over a document. PDF export saves to a user-selected/local export location.

## 11. Search, notifications, and audit

`Ctrl+K` searches patients, appointments, invoices, documents, staff, and inventory available to the signed-in user. Notifications include low-stock and verified-backup reminders. Marking a notification read does not change the underlying record.

The audit page is restricted. Audit entries are append-only and record attributable actions, outcomes, record identifiers, time, and workstation without deliberately duplicating full clinical content.

## 12. Backup, restore, and diagnostics

See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) before restoring. Restore is a high-impact administrative action. Verify the selected package, preview contents, read dependencies, choose duplicate handling intentionally, and ensure no one else is using the workspace.

**Settings → Diagnostics** reports application/schema version, SQLite integrity, foreign-key status, locations, and available disk space. Use it before a major update and after restoration. Diagnostic logs are stored under the Dentiva data folder.

## 13. End-of-day checklist

1. Finish or correctly status today's appointments.
2. Confirm every completed treatment has an attributable clinical entry.
3. Reconcile issued invoices, received amounts, refunds, and expenses.
4. Review outstanding balances and exceptions.
5. Review low-stock notices.
6. Create and verify a protected backup when due.
7. Lock or sign out of Dentiva and secure the workstation.
