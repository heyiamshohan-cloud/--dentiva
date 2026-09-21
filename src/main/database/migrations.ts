export interface Migration { version: number; name: string; sql: string; }

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'core_security_and_patient_records',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE clinics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
        dentist_name TEXT NOT NULL,
        professional_title TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL,
        alternative_phone TEXT,
        email TEXT,
        address TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        district TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'Bangladesh',
        registration_info TEXT,
        opening_hours TEXT,
        working_days_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(working_days_json)),
        currency_code TEXT NOT NULL DEFAULT 'BDT',
        currency_symbol TEXT NOT NULL DEFAULT '৳',
        invoice_prefix TEXT NOT NULL DEFAULT 'INV',
        patient_prefix TEXT NOT NULL DEFAULT 'DTV',
        appointment_prefix TEXT NOT NULL DEFAULT 'APT',
        date_format TEXT NOT NULL DEFAULT 'dd MMM yyyy',
        time_format TEXT NOT NULL DEFAULT 'hh:mm a',
        default_language TEXT NOT NULL DEFAULT 'en' CHECK(default_language IN ('en','bn')),
        default_printer TEXT,
        footer_text TEXT,
        invoice_terms TEXT,
        payment_instructions TEXT,
        emergency_contact TEXT,
        logo_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        description TEXT,
        is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0,1)),
        created_at TEXT NOT NULL,
        UNIQUE(clinic_id, name)
      ) STRICT;

      CREATE TABLE permissions (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL
      ) STRICT;

      CREATE TABLE role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
        PRIMARY KEY(role_id, permission_code)
      ) STRICT;

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        username TEXT NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iterations INTEGER NOT NULL CHECK(password_iterations >= 100000),
        language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','bn')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','locked','disabled')),
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login_at TEXT,
        password_changed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, username)
      ) STRICT;

      CREATE TABLE user_roles (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY(user_id, role_id)
      ) STRICT;

      CREATE TABLE app_settings (
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL CHECK(json_valid(value_json)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(clinic_id, key)
      ) STRICT;

      CREATE TABLE counters (
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        counter_key TEXT NOT NULL,
        current_value INTEGER NOT NULL DEFAULT 0 CHECK(current_value >= 0),
        PRIMARY KEY(clinic_id, counter_key)
      ) STRICT;

      CREATE TABLE patients (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_code TEXT NOT NULL COLLATE NOCASE,
        full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 180),
        preferred_name TEXT,
        phone TEXT NOT NULL,
        alternative_phone TEXT,
        email TEXT,
        date_of_birth TEXT,
        gender TEXT NOT NULL DEFAULT 'undisclosed' CHECK(gender IN ('male','female','other','undisclosed')),
        blood_group TEXT,
        address TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        occupation TEXT,
        identification_type TEXT,
        identification_number TEXT,
        medical_alerts TEXT,
        allergies_summary TEXT,
        current_medications TEXT,
        medical_conditions TEXT,
        dental_history TEXT,
        previous_dentist TEXT,
        referral_source TEXT,
        registration_date TEXT NOT NULL,
        last_visit TEXT,
        next_appointment TEXT,
        outstanding_minor INTEGER NOT NULL DEFAULT 0 CHECK(outstanding_minor >= 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived','deceased')),
        notes TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        UNIQUE(clinic_id, patient_code)
      ) STRICT;

      CREATE TABLE patient_allergies (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        allergen TEXT NOT NULL,
        reaction TEXT,
        severity TEXT CHECK(severity IN ('mild','moderate','severe','unknown')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
        recorded_at TEXT NOT NULL,
        recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE patient_medications (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        medicine_name TEXT NOT NULL,
        strength TEXT,
        dosage TEXT,
        started_at TEXT,
        ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'current' CHECK(status IN ('current','past')),
        notes TEXT,
        recorded_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE patient_conditions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        condition_name TEXT NOT NULL,
        diagnosed_at TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','controlled','resolved')),
        notes TEXT,
        recorded_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE patient_consents (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        consent_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('granted','withdrawn','expired')),
        granted_at TEXT,
        expires_at TEXT,
        withdrawn_at TEXT,
        document_attachment_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT REFERENCES clinics(id) ON DELETE SET NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_identifier TEXT,
        summary TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
        correlation_id TEXT,
        workstation TEXT
      ) STRICT;

      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('info','success','warning','error')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
        created_at TEXT NOT NULL,
        read_at TEXT,
        expires_at TEXT
      ) STRICT;

      CREATE INDEX idx_patients_name ON patients(clinic_id, full_name COLLATE NOCASE);
      CREATE INDEX idx_patients_phone ON patients(clinic_id, phone);
      CREATE INDEX idx_patients_email ON patients(clinic_id, email COLLATE NOCASE);
      CREATE INDEX idx_patients_status ON patients(clinic_id, status, updated_at DESC);
      CREATE INDEX idx_patients_dob ON patients(clinic_id, date_of_birth);
      CREATE INDEX idx_audit_time ON audit_logs(clinic_id, timestamp DESC);
      CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_identifier);
      CREATE INDEX idx_notifications_unread ON notifications(clinic_id, is_read, created_at DESC);
    `
  },
  {
    version: 2,
    name: 'clinical_financial_operations_and_documents',
    sql: `
      CREATE TABLE staff (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        staff_code TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        photo_path TEXT,
        phone TEXT,
        email TEXT,
        role TEXT NOT NULL,
        responsibilities TEXT,
        joining_date TEXT,
        salary_minor INTEGER CHECK(salary_minor IS NULL OR salary_minor >= 0),
        salary_frequency TEXT,
        working_hours TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        emergency_contact TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, staff_code)
      ) STRICT;

      CREATE TABLE staff_salary_history (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
        amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
        frequency TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE appointments (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        appointment_code TEXT NOT NULL COLLATE NOCASE,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        dentist_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
        appointment_type TEXT NOT NULL,
        reason TEXT,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 720),
        status TEXT NOT NULL CHECK(status IN ('scheduled','confirmed','waiting','in_consultation','completed','cancelled','no_show','rescheduled')),
        serial_number INTEGER,
        notes TEXT,
        follow_up INTEGER NOT NULL DEFAULT 0 CHECK(follow_up IN (0,1)),
        chair TEXT,
        rescheduled_from_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
        checked_in_at TEXT,
        consultation_started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, appointment_code)
      ) STRICT;

      CREATE TABLE visits (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
        provider_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
        visit_number TEXT NOT NULL COLLATE NOCASE,
        visited_at TEXT NOT NULL,
        chief_complaint TEXT,
        reason TEXT,
        symptoms TEXT,
        clinical_findings TEXT,
        diagnosis TEXT,
        treatment_plan TEXT,
        treatment_performed TEXT,
        procedure_details TEXT,
        materials_used TEXT,
        follow_up_recommendation TEXT,
        next_visit_date TEXT,
        dentist_notes TEXT,
        assistant_notes TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(clinic_id, visit_number)
      ) STRICT;

      CREATE TABLE clinical_notes (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
        author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        note_type TEXT NOT NULL CHECK(note_type IN ('clinical','dentist','assistant','progress')),
        content TEXT NOT NULL CHECK(length(trim(content)) > 0),
        created_at TEXT NOT NULL,
        amended_at TEXT,
        amendment_reason TEXT,
        supersedes_id TEXT REFERENCES clinical_notes(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE diagnoses (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
        code TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        recorded_at TEXT NOT NULL,
        recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE treatment_catalog (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        code TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        category TEXT,
        default_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(default_fee_minor >= 0),
        duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes > 0),
        description TEXT,
        tax_rate REAL NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, code)
      ) STRICT;

      CREATE TABLE visit_treatments (
        id TEXT PRIMARY KEY,
        visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
        treatment_id TEXT REFERENCES treatment_catalog(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        tooth_number TEXT,
        quantity REAL NOT NULL DEFAULT 1 CHECK(quantity > 0),
        fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(fee_minor >= 0),
        status TEXT NOT NULL CHECK(status IN ('planned','in_progress','completed','cancelled')),
        performed_at TEXT,
        provider_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE dental_chart_entries (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        dentition TEXT NOT NULL CHECK(dentition IN ('adult','primary')),
        tooth_number TEXT NOT NULL,
        surface TEXT,
        condition TEXT NOT NULL,
        procedure TEXT,
        status TEXT NOT NULL CHECK(status IN ('observed','planned','in_progress','completed','cancelled')),
        notes TEXT,
        recorded_at TEXT NOT NULL,
        recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE prescriptions (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        prescription_number TEXT NOT NULL COLLATE NOCASE,
        prescribed_at TEXT NOT NULL,
        provider_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
        diagnosis TEXT,
        advice TEXT,
        follow_up_date TEXT,
        language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','bn')),
        created_at TEXT NOT NULL,
        UNIQUE(clinic_id, prescription_number)
      ) STRICT;

      CREATE TABLE prescription_items (
        id TEXT PRIMARY KEY,
        prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        medicine_name TEXT NOT NULL,
        generic_name TEXT,
        strength TEXT,
        dosage TEXT NOT NULL,
        frequency TEXT NOT NULL,
        duration TEXT NOT NULL,
        route TEXT,
        meal_timing TEXT,
        quantity TEXT,
        instructions TEXT,
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE referrals (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        referral_number TEXT NOT NULL,
        reason TEXT NOT NULL,
        destination TEXT NOT NULL,
        provider TEXT,
        referral_date TEXT NOT NULL,
        response TEXT,
        outcome TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, referral_number)
      ) STRICT;

      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
        document_type TEXT NOT NULL,
        document_number TEXT,
        title TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','bn')),
        generated_path TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
        created_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        referral_id TEXT REFERENCES referrals(id) ON DELETE SET NULL,
        invoice_id TEXT,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
        category TEXT NOT NULL CHECK(category IN ('xray','report','prescription','referral','document','consent','before_after','other')),
        description TEXT,
        source TEXT,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        archived_at TEXT
      ) STRICT;

      CREATE TABLE payment_methods (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        kind TEXT NOT NULL CHECK(kind IN ('cash','bank','card','mfs','other')),
        provider TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(clinic_id, name)
      ) STRICT;

      CREATE TABLE invoices (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        invoice_number TEXT NOT NULL COLLATE NOCASE,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        issued_at TEXT NOT NULL,
        due_at TEXT,
        subtotal_minor INTEGER NOT NULL CHECK(subtotal_minor >= 0),
        discount_minor INTEGER NOT NULL DEFAULT 0 CHECK(discount_minor >= 0),
        tax_minor INTEGER NOT NULL DEFAULT 0 CHECK(tax_minor >= 0),
        total_minor INTEGER NOT NULL CHECK(total_minor >= 0),
        paid_minor INTEGER NOT NULL DEFAULT 0 CHECK(paid_minor >= 0),
        due_minor INTEGER NOT NULL CHECK(due_minor >= 0),
        status TEXT NOT NULL CHECK(status IN ('draft','issued','partially_paid','paid','overdue','void')),
        notes TEXT,
        terms TEXT,
        void_reason TEXT,
        voided_at TEXT,
        voided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        CHECK(total_minor = subtotal_minor - discount_minor + tax_minor),
        CHECK(discount_minor <= subtotal_minor + tax_minor),
        CHECK(paid_minor <= total_minor),
        CHECK(due_minor = total_minor - paid_minor),
        UNIQUE(clinic_id, invoice_number)
      ) STRICT;

      CREATE TABLE invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
        treatment_id TEXT REFERENCES treatment_catalog(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
        discount_minor INTEGER NOT NULL DEFAULT 0 CHECK(discount_minor >= 0),
        tax_rate REAL NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100),
        tax_minor INTEGER NOT NULL DEFAULT 0 CHECK(tax_minor >= 0),
        line_total_minor INTEGER NOT NULL CHECK(line_total_minor >= 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        CHECK(line_total_minor = CAST(ROUND(quantity * unit_price_minor) AS INTEGER) - discount_minor + tax_minor)
      ) STRICT;

      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
        receipt_number TEXT NOT NULL COLLATE NOCASE,
        amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
        paid_at TEXT NOT NULL,
        method TEXT NOT NULL,
        provider TEXT,
        reference TEXT,
        notes TEXT,
        received_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        voided_at TEXT,
        void_reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(clinic_id, receipt_number)
      ) STRICT;

      CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
        amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
        refunded_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE expense_categories (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(clinic_id, name)
      ) STRICT;

      CREATE TABLE expenses (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        expense_number TEXT NOT NULL COLLATE NOCASE,
        category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
        amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
        expense_date TEXT NOT NULL,
        payee TEXT,
        method TEXT NOT NULL,
        reference TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','void')),
        void_reason TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(clinic_id, expense_number)
      ) STRICT;

      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, name)
      ) STRICT;

      CREATE TABLE inventory_categories (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        UNIQUE(clinic_id, name)
      ) STRICT;

      CREATE TABLE inventory_items (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        sku TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
        unit TEXT NOT NULL,
        current_stock REAL NOT NULL DEFAULT 0 CHECK(current_stock >= 0),
        minimum_stock REAL NOT NULL DEFAULT 0 CHECK(minimum_stock >= 0),
        purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK(purchase_price_minor >= 0),
        supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
        expiry_date TEXT,
        batch_number TEXT,
        location TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, sku)
      ) STRICT;

      CREATE TABLE inventory_transactions (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('stock_in','stock_out','adjustment','wastage')),
        quantity REAL NOT NULL,
        previous_stock REAL NOT NULL CHECK(previous_stock >= 0),
        resulting_stock REAL NOT NULL CHECK(resulting_stock >= 0),
        unit_cost_minor INTEGER CHECK(unit_cost_minor IS NULL OR unit_cost_minor >= 0),
        reference TEXT,
        notes TEXT,
        transaction_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE backup_records (
        id TEXT PRIMARY KEY,
        clinic_id TEXT REFERENCES clinics(id) ON DELETE SET NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        backup_type TEXT NOT NULL CHECK(backup_type IN ('full','manual','scheduled')),
        size_bytes INTEGER NOT NULL DEFAULT 0,
        encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0,1)),
        status TEXT NOT NULL CHECK(status IN ('running','verified','failed')),
        checksum TEXT,
        created_at TEXT NOT NULL,
        verified_at TEXT,
        error_summary TEXT
      ) STRICT;

      CREATE TABLE import_jobs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT REFERENCES clinics(id) ON DELETE SET NULL,
        source_path TEXT NOT NULL,
        package_version TEXT,
        mode TEXT NOT NULL CHECK(mode IN ('full','selective')),
        duplicate_strategy TEXT NOT NULL CHECK(duplicate_strategy IN ('skip','update','copy')),
        status TEXT NOT NULL CHECK(status IN ('analyzing','ready','running','completed','failed','rolled_back')),
        selection_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(selection_json)),
        result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_summary TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE document_templates (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        template_type TEXT NOT NULL,
        name TEXT NOT NULL,
        language TEXT NOT NULL CHECK(language IN ('en','bn')),
        configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json)),
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, template_type, name, language)
      ) STRICT;

      CREATE TABLE lab_cases (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
        case_number TEXT NOT NULL,
        description TEXT NOT NULL,
        sent_at TEXT,
        due_at TEXT,
        received_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('planned','sent','in_progress','received','fitted','cancelled')),
        cost_minor INTEGER NOT NULL DEFAULT 0 CHECK(cost_minor >= 0),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, case_number)
      ) STRICT;

      CREATE TABLE communications (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK(channel IN ('phone','sms','email','in_person','other')),
        direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
        subject TEXT,
        summary TEXT NOT NULL,
        communicated_at TEXT NOT NULL,
        recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX idx_appointments_day ON appointments(clinic_id, start_at, status);
      CREATE INDEX idx_appointments_patient ON appointments(patient_id, start_at DESC);
      CREATE UNIQUE INDEX idx_serial_unique_active ON appointments(clinic_id, substr(start_at,1,10), serial_number)
        WHERE serial_number IS NOT NULL AND status NOT IN ('cancelled','rescheduled');
      CREATE INDEX idx_visits_patient ON visits(patient_id, visited_at DESC);
      CREATE INDEX idx_visits_clinic_date ON visits(clinic_id, visited_at DESC);
      CREATE INDEX idx_chart_patient_tooth ON dental_chart_entries(patient_id, dentition, tooth_number, recorded_at DESC);
      CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id, prescribed_at DESC);
      CREATE INDEX idx_invoices_patient ON invoices(patient_id, issued_at DESC);
      CREATE INDEX idx_invoices_status ON invoices(clinic_id, status, issued_at DESC);
      CREATE INDEX idx_payments_date ON payments(clinic_id, paid_at DESC);
      CREATE INDEX idx_expenses_date ON expenses(clinic_id, expense_date DESC);
      CREATE INDEX idx_inventory_low ON inventory_items(clinic_id, active, current_stock, minimum_stock);
      CREATE INDEX idx_inventory_expiry ON inventory_items(clinic_id, expiry_date) WHERE expiry_date IS NOT NULL;
      CREATE INDEX idx_attachments_patient ON attachments(patient_id, created_at DESC);
      CREATE INDEX idx_attachments_hash ON attachments(clinic_id, sha256);
      CREATE INDEX idx_referrals_patient ON referrals(patient_id, referral_date DESC);
      CREATE INDEX idx_communications_patient ON communications(patient_id, communicated_at DESC);
    `
  },
  {
    version: 3,
    name: 'search_reporting_and_integrity_views',
    sql: `
      CREATE VIRTUAL TABLE patients_fts USING fts5(
        patient_id UNINDEXED,
        patient_code,
        full_name,
        preferred_name,
        phone,
        alternative_phone,
        email,
        address,
        tokenize='unicode61 remove_diacritics 2'
      );

      INSERT INTO patients_fts(patient_id, patient_code, full_name, preferred_name, phone, alternative_phone, email, address)
      SELECT id, patient_code, full_name, coalesce(preferred_name,''), phone, coalesce(alternative_phone,''), coalesce(email,''), coalesce(address,'') FROM patients;

      CREATE TRIGGER patients_fts_insert AFTER INSERT ON patients BEGIN
        INSERT INTO patients_fts(patient_id, patient_code, full_name, preferred_name, phone, alternative_phone, email, address)
        VALUES(new.id, new.patient_code, new.full_name, coalesce(new.preferred_name,''), new.phone, coalesce(new.alternative_phone,''), coalesce(new.email,''), coalesce(new.address,''));
      END;

      CREATE TRIGGER patients_fts_update AFTER UPDATE OF patient_code, full_name, preferred_name, phone, alternative_phone, email, address ON patients BEGIN
        DELETE FROM patients_fts WHERE patient_id = old.id;
        INSERT INTO patients_fts(patient_id, patient_code, full_name, preferred_name, phone, alternative_phone, email, address)
        VALUES(new.id, new.patient_code, new.full_name, coalesce(new.preferred_name,''), new.phone, coalesce(new.alternative_phone,''), coalesce(new.email,''), coalesce(new.address,''));
      END;

      CREATE TRIGGER patients_fts_delete AFTER DELETE ON patients BEGIN
        DELETE FROM patients_fts WHERE patient_id = old.id;
      END;

      CREATE VIEW invoice_reconciliation AS
        SELECT i.id AS invoice_id,
               i.total_minor,
               i.paid_minor,
               i.due_minor,
               coalesce((SELECT sum(p.amount_minor) FROM payments p WHERE p.invoice_id=i.id AND p.voided_at IS NULL),0) AS payment_total_minor,
               coalesce((SELECT sum(r.amount_minor) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=i.id),0) AS refund_total_minor
        FROM invoices i;

      CREATE VIEW patient_balances AS
        SELECT p.id AS patient_id,
               coalesce(sum(CASE WHEN i.status != 'void' THEN i.due_minor ELSE 0 END),0) AS outstanding_minor
        FROM patients p LEFT JOIN invoices i ON i.patient_id=p.id
        GROUP BY p.id;

      CREATE VIEW daily_financial_summary AS
        SELECT clinic_id, financial_date,
               sum(revenue_minor) AS revenue_minor,
               sum(expense_minor) AS expense_minor,
               sum(refund_minor) AS refund_minor
        FROM (
          SELECT clinic_id, substr(paid_at,1,10) AS financial_date, amount_minor AS revenue_minor, 0 AS expense_minor, 0 AS refund_minor
            FROM payments WHERE voided_at IS NULL
          UNION ALL
          SELECT clinic_id, substr(expense_date,1,10), 0, amount_minor, 0 FROM expenses WHERE status='recorded'
          UNION ALL
          SELECT r.clinic_id, substr(r.refunded_at,1,10), 0, 0, r.amount_minor FROM refunds r
        ) GROUP BY clinic_id, financial_date;

      CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'Audit records are immutable');
      END;
      CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'Audit records are immutable');
      END;
    `
  },
  {
    version: 4,
    name: 'structured_treatment_plans',
    sql: `
      CREATE TABLE treatment_plans (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
        provider_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
        plan_number TEXT NOT NULL COLLATE NOCASE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','presented','accepted','in_progress','completed','cancelled')),
        notes TEXT,
        total_estimate_minor INTEGER NOT NULL DEFAULT 0 CHECK(total_estimate_minor >= 0),
        accepted_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(clinic_id, plan_number)
      ) STRICT;

      CREATE TABLE treatment_plan_items (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES treatment_plans(id) ON DELETE RESTRICT,
        treatment_id TEXT REFERENCES treatment_catalog(id) ON DELETE SET NULL,
        tooth_number TEXT,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1 CHECK(quantity > 0),
        unit_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(unit_fee_minor >= 0),
        discount_minor INTEGER NOT NULL DEFAULT 0 CHECK(discount_minor >= 0),
        line_total_minor INTEGER NOT NULL DEFAULT 0 CHECK(line_total_minor >= 0),
        status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','cancelled')),
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX idx_treatment_plans_patient ON treatment_plans(patient_id, created_at DESC);
      CREATE INDEX idx_treatment_plans_status ON treatment_plans(clinic_id, status, updated_at DESC);
      CREATE INDEX idx_treatment_plan_items_plan ON treatment_plan_items(plan_id, sort_order);
      INSERT OR IGNORE INTO counters(clinic_id,counter_key,current_value) SELECT id,'treatment_plan',0 FROM clinics;
    `
  }
];

export const latestSchemaVersion = migrations[migrations.length - 1]?.version ?? 0;
