import type {
  Appointment, AttachmentRecord, BackupRecord, Clinic, DentalChartEntry, Expense, Invoice,
  InventoryItem, NotificationRecord, Patient, Payment, Prescription, PrescriptionItem,
  Staff, Supplier, TreatmentCatalogItem, Visit
} from '../../shared/types.js';

type Row = Record<string, unknown>;

export function stringOrNull(value: unknown): string | null { return value === null || value === undefined ? null : String(value); }
export function booleanValue(value: unknown): boolean { return Number(value) === 1; }
export function jsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

export function ageFromBirthDate(value: string | null, today = new Date()): number | null {
  if (!value) return null;
  const birth = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function mapClinic(r: Row): Clinic {
  return {
    id: String(r.id), name: String(r.name), dentistName: String(r.dentist_name), professionalTitle: String(r.professional_title ?? ''),
    phone: String(r.phone), alternativePhone: stringOrNull(r.alternative_phone), email: stringOrNull(r.email), address: String(r.address),
    city: String(r.city ?? ''), district: String(r.district ?? ''), country: String(r.country), registrationInfo: stringOrNull(r.registration_info),
    openingHours: stringOrNull(r.opening_hours), workingDays: jsonArray(r.working_days_json), currencyCode: String(r.currency_code),
    currencySymbol: String(r.currency_symbol), invoicePrefix: String(r.invoice_prefix), patientPrefix: String(r.patient_prefix),
    appointmentPrefix: String(r.appointment_prefix), dateFormat: String(r.date_format), timeFormat: String(r.time_format),
    defaultLanguage: r.default_language === 'bn' ? 'bn' : 'en', defaultPrinter: stringOrNull(r.default_printer), footerText: stringOrNull(r.footer_text),
    invoiceTerms: stringOrNull(r.invoice_terms), paymentInstructions: stringOrNull(r.payment_instructions), emergencyContact: stringOrNull(r.emergency_contact),
    logoPath: stringOrNull(r.logo_path), createdAt: String(r.created_at), updatedAt: String(r.updated_at)
  };
}

export function mapPatient(r: Row): Patient {
  const dateOfBirth = stringOrNull(r.date_of_birth);
  return {
    id: String(r.id), clinicId: String(r.clinic_id), patientCode: String(r.patient_code), fullName: String(r.full_name),
    preferredName: stringOrNull(r.preferred_name), phone: String(r.phone), alternativePhone: stringOrNull(r.alternative_phone),
    email: stringOrNull(r.email), dateOfBirth, age: ageFromBirthDate(dateOfBirth), gender: r.gender as Patient['gender'],
    bloodGroup: stringOrNull(r.blood_group), address: stringOrNull(r.address), emergencyContact: stringOrNull(r.emergency_contact),
    emergencyPhone: stringOrNull(r.emergency_phone), occupation: stringOrNull(r.occupation), identificationType: stringOrNull(r.identification_type),
    identificationNumber: stringOrNull(r.identification_number), medicalAlerts: stringOrNull(r.medical_alerts), allergiesSummary: stringOrNull(r.allergies_summary),
    currentMedications: stringOrNull(r.current_medications), medicalConditions: stringOrNull(r.medical_conditions), dentalHistory: stringOrNull(r.dental_history),
    previousDentist: stringOrNull(r.previous_dentist), referralSource: stringOrNull(r.referral_source), registrationDate: String(r.registration_date),
    lastVisit: stringOrNull(r.last_visit), nextAppointment: stringOrNull(r.next_appointment), outstandingMinor: Number(r.outstanding_minor ?? 0),
    status: r.status as Patient['status'], notes: stringOrNull(r.notes), tags: jsonArray(r.tags_json), isFavorite: booleanValue(r.is_favorite),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at), archivedAt: stringOrNull(r.archived_at)
  };
}

export function mapAppointment(r: Row): Appointment {
  return {
    id: String(r.id), clinicId: String(r.clinic_id), appointmentCode: String(r.appointment_code), patientId: String(r.patient_id),
    patientCode: stringOrNull(r.patient_code) ?? undefined, patientName: stringOrNull(r.patient_name) ?? undefined,
    dentistId: stringOrNull(r.dentist_id), dentistName: stringOrNull(r.dentist_name), appointmentType: String(r.appointment_type),
    reason: stringOrNull(r.reason), startAt: String(r.start_at), endAt: String(r.end_at), durationMinutes: Number(r.duration_minutes),
    status: r.status as Appointment['status'], serialNumber: r.serial_number === null || r.serial_number === undefined ? null : Number(r.serial_number),
    notes: stringOrNull(r.notes), followUp: booleanValue(r.follow_up), chair: stringOrNull(r.chair), rescheduledFromId: stringOrNull(r.rescheduled_from_id),
    checkedInAt: stringOrNull(r.checked_in_at), consultationStartedAt: stringOrNull(r.consultation_started_at), completedAt: stringOrNull(r.completed_at),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at)
  };
}

export function mapVisit(r: Row): Visit {
  return {
    id: String(r.id), clinicId: String(r.clinic_id), patientId: String(r.patient_id), patientName: stringOrNull(r.patient_name) ?? undefined,
    patientCode: stringOrNull(r.patient_code) ?? undefined, appointmentId: stringOrNull(r.appointment_id), providerId: stringOrNull(r.provider_id),
    providerName: stringOrNull(r.provider_name), visitNumber: String(r.visit_number), visitedAt: String(r.visited_at),
    chiefComplaint: stringOrNull(r.chief_complaint), reason: stringOrNull(r.reason), symptoms: stringOrNull(r.symptoms),
    clinicalFindings: stringOrNull(r.clinical_findings), diagnosis: stringOrNull(r.diagnosis), treatmentPlan: stringOrNull(r.treatment_plan),
    treatmentPerformed: stringOrNull(r.treatment_performed), procedureDetails: stringOrNull(r.procedure_details), materialsUsed: stringOrNull(r.materials_used),
    followUpRecommendation: stringOrNull(r.follow_up_recommendation), nextVisitDate: stringOrNull(r.next_visit_date),
    dentistNotes: stringOrNull(r.dentist_notes), assistantNotes: stringOrNull(r.assistant_notes), status: r.status as Visit['status'],
    createdAt: String(r.created_at), updatedAt: String(r.updated_at), completedAt: stringOrNull(r.completed_at)
  };
}

export function mapChartEntry(r: Row): DentalChartEntry {
  return {
    id: String(r.id), patientId: String(r.patient_id), visitId: stringOrNull(r.visit_id), dentition: r.dentition as DentalChartEntry['dentition'],
    toothNumber: String(r.tooth_number), surface: stringOrNull(r.surface), condition: String(r.condition), procedure: stringOrNull(r.procedure),
    status: r.status as DentalChartEntry['status'], notes: stringOrNull(r.notes), recordedAt: String(r.recorded_at), recordedBy: String(r.recorded_by ?? '')
  };
}

export function mapPrescriptionItem(r: Row): PrescriptionItem {
  return { id: String(r.id), medicineName: String(r.medicine_name), genericName: stringOrNull(r.generic_name), strength: stringOrNull(r.strength),
    dosage: String(r.dosage), frequency: String(r.frequency), duration: String(r.duration), route: stringOrNull(r.route), mealTiming: stringOrNull(r.meal_timing),
    quantity: stringOrNull(r.quantity), instructions: stringOrNull(r.instructions), notes: stringOrNull(r.notes) };
}

export function mapPrescription(r: Row, items: PrescriptionItem[] = []): Prescription {
  return { id: String(r.id), clinicId: String(r.clinic_id), patientId: String(r.patient_id), visitId: stringOrNull(r.visit_id),
    prescriptionNumber: String(r.prescription_number), prescribedAt: String(r.prescribed_at), providerId: String(r.provider_id ?? ''),
    diagnosis: stringOrNull(r.diagnosis), advice: stringOrNull(r.advice), followUpDate: stringOrNull(r.follow_up_date), language: r.language === 'bn' ? 'bn' : 'en',
    items, createdAt: String(r.created_at) };
}

export function mapInvoice(r: Row, items: Invoice['items'] = []): Invoice {
  return { id: String(r.id), clinicId: String(r.clinic_id), invoiceNumber: String(r.invoice_number), patientId: String(r.patient_id),
    patientName: stringOrNull(r.patient_name) ?? undefined, patientCode: stringOrNull(r.patient_code) ?? undefined, visitId: stringOrNull(r.visit_id),
    issuedAt: String(r.issued_at), dueAt: stringOrNull(r.due_at), subtotalMinor: Number(r.subtotal_minor), discountMinor: Number(r.discount_minor),
    taxMinor: Number(r.tax_minor), totalMinor: Number(r.total_minor), paidMinor: Number(r.paid_minor), dueMinor: Number(r.due_minor),
    status: r.status as Invoice['status'], notes: stringOrNull(r.notes), terms: stringOrNull(r.terms), items,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
}

export function mapPayment(r: Row): Payment {
  return { id: String(r.id), invoiceId: String(r.invoice_id), receiptNumber: String(r.receipt_number), amountMinor: Number(r.amount_minor),
    paidAt: String(r.paid_at), method: String(r.method), provider: stringOrNull(r.provider), reference: stringOrNull(r.reference), notes: stringOrNull(r.notes),
    receivedBy: String(r.received_by ?? ''), voidedAt: stringOrNull(r.voided_at), createdAt: String(r.created_at) };
}

export function mapExpense(r: Row): Expense {
  return { id: String(r.id), expenseNumber: String(r.expense_number), categoryId: String(r.category_id), categoryName: stringOrNull(r.category_name) ?? undefined,
    amountMinor: Number(r.amount_minor), expenseDate: String(r.expense_date), payee: stringOrNull(r.payee), method: String(r.method),
    reference: stringOrNull(r.reference), description: String(r.description), status: r.status as Expense['status'], createdAt: String(r.created_at) };
}

export function mapStaff(r: Row): Staff {
  return { id: String(r.id), staffCode: String(r.staff_code), name: String(r.name), phone: stringOrNull(r.phone), email: stringOrNull(r.email), role: String(r.role),
    responsibilities: stringOrNull(r.responsibilities), joiningDate: stringOrNull(r.joining_date), salaryMinor: r.salary_minor === null ? null : Number(r.salary_minor),
    salaryFrequency: stringOrNull(r.salary_frequency), workingHours: stringOrNull(r.working_hours), status: r.status as Staff['status'], emergencyContact: stringOrNull(r.emergency_contact),
    address: stringOrNull(r.address), notes: stringOrNull(r.notes), photoPath: stringOrNull(r.photo_path) };
}

export function mapInventory(r: Row): InventoryItem {
  return { id: String(r.id), sku: String(r.sku), name: String(r.name), categoryId: stringOrNull(r.category_id), categoryName: stringOrNull(r.category_name), unit: String(r.unit),
    currentStock: Number(r.current_stock), minimumStock: Number(r.minimum_stock), purchasePriceMinor: Number(r.purchase_price_minor), supplierId: stringOrNull(r.supplier_id),
    supplierName: stringOrNull(r.supplier_name), expiryDate: stringOrNull(r.expiry_date), batchNumber: stringOrNull(r.batch_number), location: stringOrNull(r.location),
    notes: stringOrNull(r.notes), active: booleanValue(r.active) };
}

export function mapSupplier(r: Row): Supplier {
  return { id: String(r.id), name: String(r.name), contactPerson: stringOrNull(r.contact_person), phone: stringOrNull(r.phone), email: stringOrNull(r.email),
    address: stringOrNull(r.address), notes: stringOrNull(r.notes), active: booleanValue(r.active) };
}

export function mapTreatment(r: Row): TreatmentCatalogItem {
  return { id: String(r.id), code: String(r.code), name: String(r.name), category: stringOrNull(r.category), defaultFeeMinor: Number(r.default_fee_minor),
    durationMinutes: r.duration_minutes === null ? null : Number(r.duration_minutes), description: stringOrNull(r.description), taxRate: Number(r.tax_rate), active: booleanValue(r.active) };
}

export function mapAttachment(r: Row): AttachmentRecord {
  return { id: String(r.id), patientId: stringOrNull(r.patient_id), visitId: stringOrNull(r.visit_id), referralId: stringOrNull(r.referral_id), invoiceId: stringOrNull(r.invoice_id),
    originalName: String(r.original_name), storedName: String(r.stored_name), relativePath: String(r.relative_path), mimeType: String(r.mime_type), extension: String(r.extension),
    sizeBytes: Number(r.size_bytes), category: r.category as AttachmentRecord['category'], description: stringOrNull(r.description), source: stringOrNull(r.source),
    sha256: String(r.sha256), createdAt: String(r.created_at), archivedAt: stringOrNull(r.archived_at) };
}

export function mapNotification(r: Row): NotificationRecord {
  return { id: String(r.id), type: String(r.type), severity: r.severity as NotificationRecord['severity'], title: String(r.title), message: String(r.message),
    entityType: stringOrNull(r.entity_type), entityId: stringOrNull(r.entity_id), isRead: booleanValue(r.is_read), createdAt: String(r.created_at) };
}

export function mapBackup(r: Row): BackupRecord {
  return { id: String(r.id), fileName: String(r.file_name), filePath: String(r.file_path), backupType: r.backup_type as BackupRecord['backupType'], sizeBytes: Number(r.size_bytes),
    encrypted: booleanValue(r.encrypted), status: r.status as BackupRecord['status'], checksum: stringOrNull(r.checksum), createdAt: String(r.created_at), verifiedAt: stringOrNull(r.verified_at) };
}
