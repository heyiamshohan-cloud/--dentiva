export type Language = 'en' | 'bn';
export type EntityId = string;
export type Money = number; // Integer minor units (poisha for BDT).

export interface ApiResult<T = void> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; field?: string; retryable?: boolean };
}

export interface AppBootstrap {
  configured: boolean;
  version: string;
  databaseVersion: number;
  clinic?: Clinic;
  language: Language;
  paths: { data: string; backups: string; exports: string };
}

export interface Clinic {
  id: EntityId;
  name: string;
  dentistName: string;
  professionalTitle: string;
  phone: string;
  alternativePhone: string | null;
  email: string | null;
  address: string;
  city: string;
  district: string;
  country: string;
  registrationInfo: string | null;
  openingHours: string | null;
  workingDays: string[];
  currencyCode: string;
  currencySymbol: string;
  invoicePrefix: string;
  patientPrefix: string;
  appointmentPrefix: string;
  dateFormat: string;
  timeFormat: string;
  defaultLanguage: Language;
  defaultPrinter: string | null;
  footerText: string | null;
  invoiceTerms: string | null;
  paymentInstructions: string | null;
  emergencyContact: string | null;
  logoPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetupInput extends Omit<Clinic, 'id' | 'createdAt' | 'updatedAt' | 'logoPath'> {
  ownerName: string;
  ownerUsername: string;
  ownerPassword: string;
  logoSourcePath?: string | null;
}

export interface SessionUser {
  id: EntityId;
  displayName: string;
  username: string;
  roleNames: string[];
  permissions: string[];
  language: Language;
}

export interface Session {
  token: string;
  user: SessionUser;
  expiresAt: string;
}

export interface LoginInput { username: string; password: string; }

export interface PageRequest {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, string | number | boolean | null | undefined>;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type PatientStatus = 'active' | 'inactive' | 'archived' | 'deceased';
export interface Patient {
  id: EntityId;
  clinicId: EntityId;
  patientCode: string;
  fullName: string;
  preferredName: string | null;
  phone: string;
  alternativePhone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  age?: number | null;
  gender: 'male' | 'female' | 'other' | 'undisclosed';
  bloodGroup: string | null;
  address: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  occupation: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
  medicalAlerts: string | null;
  allergiesSummary: string | null;
  currentMedications: string | null;
  medicalConditions: string | null;
  dentalHistory: string | null;
  previousDentist: string | null;
  referralSource: string | null;
  registrationDate: string;
  lastVisit: string | null;
  nextAppointment: string | null;
  outstandingMinor: Money;
  status: PatientStatus;
  notes: string | null;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type PatientInput = Omit<Patient,
  'id' | 'clinicId' | 'patientCode' | 'registrationDate' | 'lastVisit' | 'nextAppointment' |
  'outstandingMinor' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'age'> & { patientCode?: string };

export interface PatientDuplicate {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  reason: 'phone' | 'email' | 'name_and_birth_date';
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'waiting' | 'in_consultation' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
export interface Appointment {
  id: EntityId;
  clinicId: EntityId;
  appointmentCode: string;
  patientId: EntityId;
  patientCode?: string;
  patientName?: string;
  dentistId: EntityId | null;
  dentistName?: string | null;
  appointmentType: string;
  reason: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  serialNumber: number | null;
  notes: string | null;
  followUp: boolean;
  chair: string | null;
  rescheduledFromId: EntityId | null;
  checkedInAt: string | null;
  consultationStartedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentInput = Pick<Appointment, 'patientId' | 'dentistId' | 'appointmentType' | 'reason' | 'startAt' | 'durationMinutes' | 'status' | 'notes' | 'followUp' | 'chair'>;

export interface Visit {
  id: EntityId;
  clinicId: EntityId;
  patientId: EntityId;
  patientName?: string;
  patientCode?: string;
  appointmentId: EntityId | null;
  providerId: EntityId | null;
  providerName?: string | null;
  visitNumber: string;
  visitedAt: string;
  chiefComplaint: string | null;
  reason: string | null;
  symptoms: string | null;
  clinicalFindings: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  treatmentPerformed: string | null;
  procedureDetails: string | null;
  materialsUsed: string | null;
  followUpRecommendation: string | null;
  nextVisitDate: string | null;
  dentistNotes: string | null;
  assistantNotes: string | null;
  status: 'open' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type VisitInput = Omit<Visit, 'id' | 'clinicId' | 'visitNumber' | 'patientName' | 'patientCode' | 'providerName' | 'createdAt' | 'updatedAt' | 'completedAt'>;

export interface ClinicalNote {
  id: EntityId;
  visitId: EntityId;
  authorId: EntityId;
  noteType: 'clinical' | 'dentist' | 'assistant' | 'progress';
  content: string;
  createdAt: string;
  amendedAt: string | null;
  amendmentReason: string | null;
}

export interface DentalChartEntry {
  id: EntityId;
  patientId: EntityId;
  visitId: EntityId | null;
  dentition: 'adult' | 'primary';
  toothNumber: string;
  surface: string | null;
  condition: string;
  procedure: string | null;
  status: 'observed' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  recordedAt: string;
  recordedBy: EntityId;
}

export interface PrescriptionItem {
  id?: EntityId;
  medicineName: string;
  genericName: string | null;
  strength: string | null;
  dosage: string;
  frequency: string;
  duration: string;
  route: string | null;
  mealTiming: string | null;
  quantity: string | null;
  instructions: string | null;
  notes: string | null;
}

export interface Prescription {
  id: EntityId;
  clinicId: EntityId;
  patientId: EntityId;
  visitId: EntityId | null;
  prescriptionNumber: string;
  prescribedAt: string;
  providerId: EntityId;
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
  language: Language;
  items: PrescriptionItem[];
  createdAt: string;
}

export type TreatmentPlanStatus='draft'|'presented'|'accepted'|'in_progress'|'completed'|'cancelled';
export interface TreatmentPlanItem {id:string;treatmentId:string|null;toothNumber:string|null;description:string;quantity:number;unitFeeMinor:Money;discountMinor:Money;lineTotalMinor:Money;status:'planned'|'in_progress'|'completed'|'cancelled';notes:string|null;sortOrder:number;createdAt:string;updatedAt:string;}
export interface TreatmentPlan {id:string;clinicId:string;patientId:string;visitId:string|null;providerId:string|null;planNumber:string;title:string;status:TreatmentPlanStatus;notes:string|null;totalEstimateMinor:Money;acceptedAt:string|null;completedAt:string|null;createdAt:string;updatedAt:string;patientName?:string;patientCode?:string;providerName?:string|null;items:TreatmentPlanItem[];}
export interface TreatmentPlanInput {patientId:string;visitId?:string|null;providerId?:string|null;title:string;status?:TreatmentPlanStatus;notes?:string|null;items:Array<{id?:string;treatmentId?:string|null;toothNumber?:string|null;description:string;quantity:number;unitFeeMinor:Money;discountMinor:Money;status?:TreatmentPlanItem['status'];notes?:string|null}>;}

export interface ReferralRecord {
  id:EntityId;clinicId:EntityId;patientId:EntityId;visitId:EntityId|null;referralNumber:string;reason:string;destination:string;provider:string|null;referralDate:string;response:string|null;outcome:string|null;status:'open'|'completed'|'cancelled';notes:string|null;createdAt:string;updatedAt:string;patientName?:string;patientCode?:string;
}

export interface TreatmentCatalogItem {
  id: EntityId;
  code: string;
  name: string;
  category: string | null;
  defaultFeeMinor: Money;
  durationMinutes: number | null;
  description: string | null;
  taxRate: number;
  active: boolean;
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export interface InvoiceItem {
  id?: EntityId;
  treatmentId: EntityId | null;
  description: string;
  quantity: number;
  unitPriceMinor: Money;
  discountMinor: Money;
  taxRate: number;
  taxMinor?: Money;
  lineTotalMinor?: Money;
}

export interface Invoice {
  id: EntityId;
  clinicId: EntityId;
  invoiceNumber: string;
  patientId: EntityId;
  patientName?: string;
  patientCode?: string;
  visitId: EntityId | null;
  issuedAt: string;
  dueAt: string | null;
  subtotalMinor: Money;
  discountMinor: Money;
  taxMinor: Money;
  totalMinor: Money;
  paidMinor: Money;
  dueMinor: Money;
  status: InvoiceStatus;
  notes: string | null;
  terms: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceInput {
  patientId: EntityId;
  visitId: EntityId | null;
  issuedAt: string;
  dueAt: string | null;
  discountMinor: Money;
  notes: string | null;
  terms: string | null;
  items: InvoiceItem[];
  issueNow: boolean;
}

export interface Payment {
  id: EntityId;
  invoiceId: EntityId;
  receiptNumber: string;
  amountMinor: Money;
  paidAt: string;
  method: string;
  provider: string | null;
  reference: string | null;
  notes: string | null;
  receivedBy: EntityId;
  voidedAt: string | null;
  createdAt: string;
}

export interface PaymentInput { invoiceId: EntityId; amountMinor: Money; paidAt: string; method: string; provider?: string | null; reference?: string | null; notes?: string | null; }

export interface Refund {
  id: EntityId;
  paymentId: EntityId;
  amountMinor: Money;
  refundedAt: string;
  reason: string;
  approvedBy: EntityId;
  createdAt: string;
}

export interface Expense {
  id: EntityId;
  expenseNumber: string;
  categoryId: EntityId;
  categoryName?: string;
  amountMinor: Money;
  expenseDate: string;
  payee: string | null;
  method: string;
  reference: string | null;
  description: string;
  status: 'recorded' | 'void';
  createdAt: string;
}

export interface Staff {
  id: EntityId;
  staffCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  responsibilities: string | null;
  joiningDate: string | null;
  salaryMinor: Money | null;
  salaryFrequency: string | null;
  workingHours: string | null;
  status: 'active' | 'inactive';
  emergencyContact: string | null;
  address: string | null;
  notes: string | null;
  photoPath: string | null;
}

export interface InventoryItem {
  id: EntityId;
  sku: string;
  name: string;
  categoryId: EntityId | null;
  categoryName?: string | null;
  unit: string;
  currentStock: number;
  minimumStock: number;
  purchasePriceMinor: Money;
  supplierId: EntityId | null;
  supplierName?: string | null;
  expiryDate: string | null;
  batchNumber: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
}

export interface InventoryTransaction {
  id: EntityId;
  inventoryItemId: EntityId;
  transactionType: 'stock_in' | 'stock_out' | 'adjustment' | 'wastage';
  quantity: number;
  previousStock: number;
  resultingStock: number;
  unitCostMinor: Money | null;
  reference: string | null;
  notes: string | null;
  transactionAt: string;
}

export interface Supplier {
  id: EntityId;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
}

export interface AttachmentRecord {
  id: EntityId;
  patientId: EntityId | null;
  visitId: EntityId | null;
  referralId: EntityId | null;
  invoiceId: EntityId | null;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  category: 'xray' | 'report' | 'prescription' | 'referral' | 'document' | 'consent' | 'before_after' | 'other';
  description: string | null;
  source: string | null;
  sha256: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface NotificationRecord {
  id: EntityId;
  type: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  entityType: string | null;
  entityId: EntityId | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditRecord {
  id: EntityId;
  timestamp: string;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityIdentifier: string | null;
  summary: string;
  outcome: 'success' | 'failure';
}

export type DatePreset = 'today' | '7days' | '1month' | '3months' | '6months' | '1year' | 'custom';
export interface DateRange { from: string; to: string; preset?: DatePreset; }

export interface DashboardData {
  range: DateRange;
  patients: number;
  appointments: number;
  waiting: number;
  completedConsultations: number;
  followUpsDue: number;
  unpaidInvoices: number;
  revenueMinor: Money;
  outstandingMinor: Money;
  upcomingAppointments: Appointment[];
  recentPatients: Patient[];
  followUps: Array<{ patientId: string; patientCode: string; patientName: string; dueDate: string }>;
  lowStock: Array<{ id: string; name: string; currentStock: number; minimumStock: number; unit: string }>;
}

export interface ReportSummary {
  range: DateRange;
  revenueMinor: Money;
  expensesMinor: Money;
  refundsMinor: Money;
  netMinor: Money;
  receivablesMinor: Money;
  newPatients: number;
  visits: number;
  appointments: number;
  paymentMethods: Array<{ method: string; amountMinor: Money; count: number }>;
  expenseCategories: Array<{ category: string; amountMinor: Money; count: number }>;
  daily: Array<{ date: string; revenueMinor: Money; expensesMinor: Money; visits: number }>;
}

export interface BackupRecord {
  id: EntityId;
  fileName: string;
  filePath: string;
  backupType: 'full' | 'manual' | 'scheduled';
  sizeBytes: number;
  encrypted: boolean;
  status: 'running' | 'verified' | 'failed';
  checksum: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface BackupAnalysis {
  packageVersion: string;
  appVersion: string;
  createdAt: string;
  encrypted: boolean;
  checksumValid: boolean;
  counts: Record<string, number>;
  patients: Array<{ id: string; patientCode: string; fullName: string; phone: string; registrationDate: string }>;
  dateBounds: Record<string, { from: string | null; to: string | null }>;
}

export interface RestoreSelection {
  modules: string[];
  patientIds?: string[];
  financialFrom?: string;
  financialTo?: string;
  duplicateStrategy: 'skip' | 'update' | 'copy';
  password?: string;
}

export interface SearchResult {
  type: 'patient' | 'appointment' | 'visit' | 'invoice' | 'document' | 'staff' | 'inventory' | 'expense';
  id: EntityId;
  title: string;
  identifier: string;
  context: string;
  date: string | null;
}

export interface SystemHealth {
  databaseIntegrity: 'ok' | string;
  databaseSize: number;
  attachmentsSize: number;
  freeDiskBytes: number;
  lastBackupAt: string | null;
  schemaVersion: number;
  appVersion: string;
  platform: string;
  paths: Record<string, string>;
}

export interface AppSettings {
  language: Language;
  autoLockMinutes: number;
  dashboardPreset: DatePreset;
  backupReminderDays: number;
  defaultAppointmentMinutes: number;
  receiptWidth: '58mm' | '80mm' | 'A4' | 'A5';
  dateFormat: string;
  timeFormat: string;
  notificationsEnabled: boolean;
  lowStockNotifications: boolean;
  appointmentNotifications: boolean;
  backupLocation: string | null;
}

export interface DocumentRequest {
  type: 'invoice' | 'receipt' | 'prescription' | 'patient_summary' | 'visit_summary' | 'referral' | 'appointment_slip';
  entityId: string;
  language?: Language;
  paperSize?: 'A4' | 'A5' | '58mm' | '80mm';
}

export interface PrintOptions {
  printerName?: string;
  copies: number;
  landscape: boolean;
  pageSize: 'A4' | 'A5' | '58mm' | '80mm';
  marginsMm: { top: number; right: number; bottom: number; left: number };
}

export interface GenericListRequest extends PageRequest {
  entity: 'appointments' | 'visits' | 'invoices' | 'expenses' | 'staff' | 'inventory' | 'suppliers' | 'notifications' | 'audit' | 'attachments' | 'treatments' | 'prescriptions' | 'referrals';
}

export interface UserAccount {
  id:string; username:string; displayName:string; language:'en'|'bn'; status:'active'|'locked'|'disabled';
  failedLoginCount:number; lockedUntil:string|null; lastLoginAt:string|null; passwordChangedAt:string; createdAt:string;
  roles:Array<{id:string;name:string}>;
}
export interface RoleDefinition { id:string;name:string;description:string|null;isSystem:boolean;permissions:string[];userCount:number; }
export interface UserAccountInput { username:string;displayName:string;password?:string;language:'en'|'bn';status:'active'|'disabled';roleIds:string[]; }
export interface RoleInput { name:string;description?:string|null;permissions:string[]; }

export interface DentivaApi {
  app: {
    bootstrap(): Promise<ApiResult<AppBootstrap>>;
    chooseFile(options: { title: string; filters?: Array<{ name: string; extensions: string[] }>; multiple?: boolean }): Promise<ApiResult<string[]>>;
    chooseDirectory(title: string): Promise<ApiResult<string | null>>;
    getPrinters(): Promise<ApiResult<Array<{ name: string; displayName: string; isDefault: boolean; status: number }>>>;
    health(token: string): Promise<ApiResult<SystemHealth>>;
    openExternal(url: string): Promise<ApiResult>;
  };
  setup: { complete(input: SetupInput): Promise<ApiResult<Session>>; };
  auth: {
    login(input: LoginInput): Promise<ApiResult<Session>>;
    logout(token: string): Promise<ApiResult>;
    lock(token: string): Promise<ApiResult>;
    touch(token: string): Promise<ApiResult<{ expiresAt: string }>>;
    changePassword(token: string, input: { currentPassword: string; newPassword: string }): Promise<ApiResult>;
  };
  dashboard: { get(token: string, range: DateRange): Promise<ApiResult<DashboardData>>; };
  patients: {
    list(token: string, request: PageRequest): Promise<ApiResult<PageResult<Patient>>>;
    get(token: string, id: string): Promise<ApiResult<Patient & { visits: Visit[]; appointments: Appointment[]; invoices: Invoice[]; chart: DentalChartEntry[]; prescriptions: Prescription[]; attachments: AttachmentRecord[] }>>;
    duplicates(token: string, input: Partial<PatientInput>): Promise<ApiResult<PatientDuplicate[]>>;
    create(token: string, input: PatientInput): Promise<ApiResult<Patient>>;
    update(token: string, id: string, input: Partial<PatientInput>): Promise<ApiResult<Patient>>;
    archive(token: string, id: string): Promise<ApiResult>;
    restore(token: string, id: string): Promise<ApiResult>;
  };
  appointments: {
    list(token: string, request: PageRequest): Promise<ApiResult<PageResult<Appointment>>>;
    create(token: string, input: AppointmentInput): Promise<ApiResult<Appointment>>;
    update(token: string, id: string, input: Partial<AppointmentInput>): Promise<ApiResult<Appointment>>;
    setStatus(token: string, id: string, status: AppointmentStatus): Promise<ApiResult<Appointment>>;
    day(token: string, date: string): Promise<ApiResult<Appointment[]>>;
  };
  clinical: {
    visits(token: string, request: PageRequest): Promise<ApiResult<PageResult<Visit>>>;
    createVisit(token: string, input: VisitInput): Promise<ApiResult<Visit>>;
    updateVisit(token: string, id: string, input: Partial<VisitInput>): Promise<ApiResult<Visit>>;
    completeVisit(token: string, id: string): Promise<ApiResult<Visit>>;
    addNote(token: string, visitId: string, note: { noteType: ClinicalNote['noteType']; content: string }): Promise<ApiResult<ClinicalNote>>;
    chart(token: string, patientId: string): Promise<ApiResult<DentalChartEntry[]>>;
    setChartEntry(token: string, entry: Omit<DentalChartEntry, 'id' | 'recordedAt' | 'recordedBy'>): Promise<ApiResult<DentalChartEntry>>;
    prescriptions(token: string, patientId: string): Promise<ApiResult<Prescription[]>>;
    createPrescription(token: string, input: Omit<Prescription, 'id' | 'clinicId' | 'prescriptionNumber' | 'createdAt'>): Promise<ApiResult<Prescription>>;
  };
  treatmentPlans:{
    list(token:string,request:PageRequest):Promise<ApiResult<PageResult<TreatmentPlan>>>;
    create(token:string,input:TreatmentPlanInput):Promise<ApiResult<TreatmentPlan>>;
    update(token:string,id:string,input:TreatmentPlanInput):Promise<ApiResult<TreatmentPlan>>;
  };
  billing: {
    list(token: string, request: PageRequest): Promise<ApiResult<PageResult<Invoice>>>;
    get(token: string, id: string): Promise<ApiResult<Invoice & { payments: Payment[]; refunds: Refund[] }>>;
    create(token: string, input: InvoiceInput): Promise<ApiResult<Invoice>>;
    issue(token: string, id: string): Promise<ApiResult<Invoice>>;
    void(token: string, id: string, reason: string): Promise<ApiResult<Invoice>>;
    addPayment(token: string, input: PaymentInput): Promise<ApiResult<Payment>>;
    refund(token: string, input: { paymentId: string; amountMinor: number; reason: string }): Promise<ApiResult<Refund>>;
    paymentMethods(token: string): Promise<ApiResult<string[]>>;
  };
  records: {
    list(token: string, request: GenericListRequest): Promise<ApiResult<PageResult<Record<string, unknown>>>>;
    create(token: string, entity: GenericListRequest['entity'], input: Record<string, unknown>): Promise<ApiResult<Record<string, unknown>>>;
    update(token: string, entity: GenericListRequest['entity'], id: string, input: Record<string, unknown>): Promise<ApiResult<Record<string, unknown>>>;
  };
  attachments: {
    add(token: string, input: { sourcePath: string; patientId?: string; visitId?: string; invoiceId?: string; category: AttachmentRecord['category']; description?: string }): Promise<ApiResult<AttachmentRecord>>;
    list(token: string, input: { patientId?: string; visitId?: string; search?: string }): Promise<ApiResult<AttachmentRecord[]>>;
    archive(token: string, id: string): Promise<ApiResult>;
    open(token: string, id: string): Promise<ApiResult>;
    mediaUrl(token: string, id: string): Promise<ApiResult<string>>;
  };
  reports: {
    summary(token: string, range: DateRange): Promise<ApiResult<ReportSummary>>;
    export(token: string, input: { report: string; range: DateRange; format: 'csv' | 'xlsx' | 'pdf'; destination?: string }): Promise<ApiResult<{ path: string }>>;
  };
  backup: {
    list(token: string): Promise<ApiResult<BackupRecord[]>>;
    create(token: string, input: { destination?: string; encryptPassword?: string; type?: 'manual' | 'scheduled' }): Promise<ApiResult<BackupRecord>>;
    verify(token: string, path: string, password?: string): Promise<ApiResult<{ valid: boolean; details: string }>>;
    analyze(token: string, path: string, password?: string): Promise<ApiResult<BackupAnalysis>>;
    restore(token: string, path: string, selection: RestoreSelection): Promise<ApiResult<{ imported: Record<string, number>; skipped: Record<string, number> }>>;
  };
  search: { global(token: string, query: string): Promise<ApiResult<SearchResult[]>>; };
  notifications: {
    list(token: string): Promise<ApiResult<NotificationRecord[]>>;
    markRead(token: string, id?: string): Promise<ApiResult>;
  };
  users: {
    list(token:string):Promise<ApiResult<UserAccount[]>>;
    roles(token:string):Promise<ApiResult<{roles:RoleDefinition[];permissions:Array<{code:string;name:string;description:string}>}>>;
    create(token:string,input:UserAccountInput):Promise<ApiResult<UserAccount>>;
    update(token:string,id:string,input:Omit<UserAccountInput,'password'>):Promise<ApiResult<UserAccount>>;
    resetPassword(token:string,id:string,password:string):Promise<ApiResult>;
    createRole(token:string,input:RoleInput):Promise<ApiResult<RoleDefinition>>;
    updateRole(token:string,id:string,input:RoleInput):Promise<ApiResult<RoleDefinition>>;
    deleteRole(token:string,id:string):Promise<ApiResult>;
  };
  settings: {
    get(token: string): Promise<ApiResult<{ clinic: Clinic; app: AppSettings }>>;
    updateClinic(token: string, input: Partial<Clinic>): Promise<ApiResult<Clinic>>;
    updateLogo(token:string,sourcePath:string|null):Promise<ApiResult<Clinic>>;
    paymentMethods(token:string):Promise<ApiResult<string[]>>;
    updatePaymentMethods(token:string,methods:string[]):Promise<ApiResult<string[]>>;
    updateApp(token: string, input: Partial<AppSettings>): Promise<ApiResult<AppSettings>>;
  };
  documents: {
    preview(token: string, request: DocumentRequest): Promise<ApiResult>;
    pdf(token: string, request: DocumentRequest, destination?: string): Promise<ApiResult<{ path: string }>>;
    print(token: string, request: DocumentRequest, options: PrintOptions): Promise<ApiResult>;
  };
}

declare global {
  interface Window { dentiva: DentivaApi; }
}
