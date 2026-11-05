-- ============================================================
--  AUTOFINEX FINANCE MANAGEMENT SYSTEM
--  COMPLETE UNIFIED DATABASE SCHEMA (PostgreSQL 18+)
-- ============================================================
--  Target Engine : PostgreSQL 18+ (Native uuidv7())
--  Architecture  : 61 Custom ENUM Types | 80 Tables | Native UUID v7 Keys
--  Formatting    : Consolidated Pure DDL (Strictly ZERO ALTER Statements)
--  Components    : 45 Base Tables + 27 Extension Tables + 8 Subscription & Feature Tables +
--                  19 Functions + 5 Triggers + 6 Views + All Indexes
-- ============================================================

-- ============================================================
--  AUTOFINEX FINANCE MANAGEMENT SYSTEM
--  COMPLETE DATABASE SCHEMA (PostgreSQL 18+)
-- ============================================================
--  Target Engine : PostgreSQL 18+ (Native uuidv7())
--  Architecture  : 61 ENUM Types | 80 Tables | 19 Functions | 5 Triggers | 6 Views
--  Formatting    : Consolidated Pure DDL (Strictly ZERO ALTER Statements)
-- ============================================================
--  TABLES IN THIS UNIFIED SCHEMA (80 Total):
--  ------------------------------------------------------------
--  [PART A: 45 BASE TABLES from AutoFinex_schema.sql]
--    1. addresses                    - Physical street addresses for customers, guardians, staff, and offices
--    2. address_history              - Historical audit trail of address changes
--    3. customer_accounts            - Mobile app customer login accounts and authentication identities
--    4. app_payment_methods          - Saved customer payment methods for mobile app
--    5. kyc_documents                - Polymorphic storage and verification records for KYC identity files
--    6. notification_settings        - Customer notification preferences and push channels
--    7. notifications                - Operational push notifications sent to customers
--    8. otp_verifications            - One-time password verification tokens and expiration tracking
--    9. owner                        - Super administrative owner accounts of finance institutions
--   10. finance_detail               - Finance branch/institution profiles and business configurations
--   11. godowns                      - Vehicle storage warehouses and yards
--   12. office_expenses              - Daily operational office income and expenses
--   13. recent_activity              - Recent transaction and operational activity feed
--   14. referrals                    - Customer referral program codes, invites, and conversion tracking
--   15. users                        - Back-office staff, admin, and agent user credentials
--   16. user_allowed_companies       - Normalized Many-to-Many junction mapping users to authorized finance companies
--   17. refresh_tokens               - JWT auth refresh tokens for mobile and web sessions
--   17. rewards_ledger               - Customer loyalty rewards points ledger (earned/redeemed)
--   18. support_tickets              - Customer support inquiries and issue tracking
--   19. users_details                - Staff employee profiles, qualifications, and HR records
--   20. vehicle_info                 - Vehicle catalogue specifications (make, model, variant, specs)
--   21. vehicle_detail               - Physical vehicle inventory records (chassis, engine, reg number, price)
--   22. customers                    - Customer master ledger records for financing deals
--   23. contacts                     - Customer and guardian phone numbers (mobile, landline, work)
--   24. guardians                    - Guarantor / guardian profiles and relationship details for loans
--   25. history_entries              - Customer interaction history logs (calls, RC submissions)
--   26. loans                        - Disbursed loans, EMI schedules, and repayment contracts
--   27. auto_debit_mandates          - Bank auto-debit (eNACH / UPI mandate) registrations for EMIs
--   28. delivery_checklist           - Vehicle handover checklist and delivery sign-offs
--   29. documents                    - Loan documentation and agreement attachments
--   30. loan_applications            - Customer loan financing requests and approval pipeline
--   31. loan_cancellations           - Loan cancellation requests, approval status, and refund processing
--   32. loan_terms_agreements        - Customer acceptance terms for pre-booking and loan agreements
--   33. mob_customers                - Bridge link between mobile app customer accounts and back-office customers
--   34. mobile_app_payment           - Digital online payments processed through mobile app gateway
--   35. mobile_down_payment          - Down payment transactions made for loan applications
--   36. payments                     - Consolidated payment records linked to mobile transactions
--   37. penalties                    - Late fees and default penalties applied on overdue loans
--   38. provider_reviews             - Customer satisfaction reviews and ratings for finance providers
--   39. receipts                     - Official digital payment receipts for down payments and EMI collections
--   40. seizing_vehicle              - Vehicle repossession / seizure tracking and release status
--   41. sub_due                      - Detailed EMI installment breakdown and due date schedules
--   42. vehicle_assured              - Vehicle quality assurance certifications and warranty inspections
--   43. vehicle_expenses             - Reconditioning, repair, and transport expenses per vehicle
--   44. vehicle_media                - Photos and video attachments for vehicle inventory
--   45. wishlist                     - Customer saved/bookmarked vehicles in mobile app
--
--  [PART B: 27 EXTENSION TABLES from test.sql]
--   46. customer_live_locations      - Real-time customer live GPS tracking and risk assessment
--   47. agent_locations              - Real-time field agent GPS locations and online status
--   48. staff_customer_visits        - Staff in-person customer field visits and geotagged check-ins
--   49. agent_login_sessions         - Field agent mobile app login sessions and device fingerprints
--   50. customer_agent_assignments   - Customer recovery and collection assignment workflow
--   51. assignment_history           - Audit log of agent customer reassignments and transfers
--   52. agent_area_allocations       - Geographic territory, pincode, and area assignments for staff
--   53. agent_invitations            - Staff and field agent onboarding invitation tokens
--   54. cash_variance_records        - Daily field cash collection reconciliation and variances
--   55. promise_to_pay               - Customer repayment commitments, broken promises, and PTP tracking
--   56. ptp_follow_ups               - Follow-up phone calls and reminders for promise-to-pay commitments
--   57. ai_conversations             - Customer AI chatbot and telecalling conversation sessions
--   58. ai_messages                  - Individual chat messages, voice transcripts, and sentiment logs
--   59. ai_customer_memory           - Long-term contextual memory and customer preferences for AI agents
--   60. ai_settings                  - Finance company AI automation rules, tones, and operational settings
--   61. ai_telecalling_leads         - Automated AI outbound calling campaign queue and lead dispatch
--   62. ai_telecalling_call_logs     - Detailed call recordings, audio metrics, and outcome logs
--   63. rsp_bank_master              - Bank master directory with IFSC routing and clearing details
--   64. finance_settings             - Branch loan policies, grace periods, penalty rules, and features
--   65. finance_bank_accounts        - Company collection bank accounts with primary routing control
--   66. qr_login_sessions            - Desktop web QR code instant login authentication sessions
--   67. qr_payment_requests          - Dynamic UPI payment QR codes with real-time webhook settlement
--   68. auto_debit_execution_logs    - Daily eNACH and UPI mandate automated execution logs
--   69. loan_application_stage_history - Audit log of loan application stage transitions and review notes
--   70. staff_salary_structures      - Employee salary compensation structures (basic, allowances, PF/ESI)
--   71. staff_salary_advances        - Staff salary advance requests, approval status, and repayments
--   72. staff_payroll_records        - Monthly payroll calculations, deductions, and salary disbursements
--
--  [PART C: 8 SUBSCRIPTION, REFERRAL & DYNAMIC FEATURE TABLES]
--   73. system_features              - Master registry of dynamic system features and modular add-ons
--   74. subscription_plans           - Plan pricing tiers (A1..A4) and capacity limits
--   75. plan_features                - Dynamic mapping of features included per plan tier
--   76. owner_subscriptions          - Base plan purchase history and frozen plan_snapshot JSONB
--   77. owner_features               - Runtime entitlement switch for active feature access
--   78. owner_referrals              - Owner-to-owner B2B referral tracking and reward discounts
--   79. owner_whatsapp_settings      - Per-owner WhatsApp Business API alert configuration
--   80. owner_addons                 - Modular à la carte feature purchases and invoices
-- ============================================================



BEGIN;

-- ============================================================
-- SECTION 1: CUSTOM ENUM TYPES (Idempotent Safe Definitions)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE subscription_status_enum AS ENUM (
    'active',
    'expired',
    'cancelled',
    'trial',
    'payment_pending'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE billing_cycle_enum AS ENUM (
    'monthly',
    'quarterly',
    'half_yearly',
    'yearly'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE owner_referral_status_enum AS ENUM (
    'pending',
    'applied',
    'expired',
    'revoked'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE addon_status_enum AS ENUM (
    'active',
    'expired',
    'cancelled',
    'payment_pending'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE active_cancelled_enum AS ENUM (
    'active',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
    'owner',
    'admin',
    'agent',
    'staff'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE relation_type_enum AS ENUM (
    'S/O',
    'D/O',
    'F/O',
    'W/O',
    'M/O'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE occupation_type_enum AS ENUM (
    'salaried',
    'self-employed',
    'retired',
    'unemployed',
    'student',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE govt_id_type_enum AS ENUM (
    'pan_card',
    'voter_id',
    'driving_license',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
    'system',
    'payment_success',
    'loan',
    'promotion',
    'emi_reminder',
    'document_ready',
    'referral'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE address_entity_type_enum AS ENUM (
    'customer',
    'guardian',
    'user',
    'finance',
    'new_customer'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE contact_entity_type_enum AS ENUM (
    'customer',
    'guardian'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE contact_number_type_enum AS ENUM (
    'mobile',
    'landline',
    'work'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_entity_type_enum AS ENUM (
    'customer',
    'guardian',
    'co_applicant',
    'new_customer',
    'finance',
    'user'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_document_type_enum AS ENUM (
    'customer_photo',
    'guardian_photo',
    'co_applicant_photo',
    'user_profile_photo',
    'user_signature',
    'signature',
    'aadhar_card',
    'pan_card',
    'driving_license',
    'voter_id',
    'passport',
    'address_proof',
    'income_proof',
    'bank_passbook',
    'cancelled_cheque',
    'ration_card',
    'electricity_bill',
    'gas_bill',
    'property_document',
    'property_photo',
    'vehicle_photo',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_document_side_enum AS ENUM (
    'front',
    'back',
    'single'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_uploader_type_enum AS ENUM (
    'staff',
    'customer_app'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kyc_verification_status_enum AS ENUM (
    'pending',
    'verified',
    'rejected'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE body_type_enum AS ENUM (
    'sedan',
    'hatchback',
    'suv',
    'muv',
    'coupe',
    'convertible',
    'scooter',
    'bike'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE fuel_type_enum AS ENUM (
    'petrol',
    'diesel',
    'electric',
    'cng',
    'hybrid'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transmission_enum AS ENUM (
    'manual',
    'automatic',
    'cvt',
    'amt'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_status_enum AS ENUM (
    'available',
    'hosted',
    'sales',
    'seized',
    'sold'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rc_status_enum AS ENUM (
    'original',
    'duplicate',
    'not_available'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rc_holder_enum AS ENUM (
    'Company',
    'customer',
    'third_party',
    'pending'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_media_type_enum AS ENUM (
    'front',
    'side',
    'back',
    'interior',
    'additional',
    'video'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE seizing_status_enum AS ENUM (
    'Pending',
    'Paid',
    'Cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deal_type_enum AS ENUM (
    'finance',
    'consulting'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE loan_status_enum AS ENUM (
    'active',
    'close',
    'seized'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE loan_application_status_enum AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE terms_type_enum AS ENUM (
    'pre_booking',
    'loan_agreement'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE checklist_item_enum AS ENUM (
    'documents_signed',
    'vehicle_delivered',
    'payment_received',
    'rc_transfer',
    'insurance_transfer'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE cancellation_reason_enum AS ENUM (
    'vehicle_not_available',
    'loan_terms_unacceptable',
    'changed_mind',
    'better_offer',
    'financial_issues',
    'found_another_vehicle',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE cancellation_status_enum AS ENUM (
    'requested',
    'approved',
    'rejected',
    'refund_processing',
    'refund_completed'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE mandate_status_enum AS ENUM (
    'active',
    'paused',
    'cancelled',
    'expired'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE pay_mode_enum AS ENUM (
    'cash',
    'online',
    'bank',
    'upi',
    'cheque',
    'mobile_app',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE office_pay_mode_enum AS ENUM (
    'Cash',
    'UPI',
    'Bank',
    'Online',
    'Mobile_App'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE office_txn_type_enum AS ENUM (
    'Income',
    'Expense'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE online_pay_method_enum AS ENUM (
    'upi',
    'credit_card',
    'debit_card',
    'net_banking',
    'wallet',
    'bank_transfer',
    'auto_pay'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM (
    'pending',
    'partial',
    'paid'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_transaction_status_enum AS ENUM (
    'initiated',
    'pending',
    'success',
    'failed',
    'cancelled',
    'refunded'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rewards_txn_type_enum AS ENUM (
    'earned',
    'redeemed',
    'expired',
    'adjusted'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE doc_status_enum AS ENUM (
    'not_issued',
    'issued',
    'delivered'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE support_ticket_status_enum AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE referral_status_enum AS ENUM (
    'pending',
    'converted',
    'expired'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE history_entry_type_enum AS ENUM (
    'call',
    'rc_book'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_status_enum AS ENUM ('pending', 'visited', 'collected', 'failed', 'reassigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE invitation_status_enum AS ENUM ('pending', 'accepted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE qr_login_status_enum AS ENUM ('pending', 'scanned', 'authenticated', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE qr_payment_status_enum AS ENUM ('generated', 'scanned', 'paid', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ptp_status_enum AS ENUM ('pending', 'paid', 'broken');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ptp_call_status_enum AS ENUM ('connected', 'not_answered', 'switched_off', 'busy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE variance_status_enum AS ENUM ('matched', 'variance', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ai_sentiment_enum AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ai_conversation_status_enum AS ENUM ('active', 'resolved', 'pending', 'escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ai_sender_type_enum AS ENUM ('ai', 'customer', 'staff', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ai_memory_category_enum AS ENUM ('preference', 'complaint', 'financial_fact', 'interaction_summary', 'risk_indicator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE lead_call_status_enum AS ENUM (
        'uncalled',
        'connecting',
        'speaking',
        'not_responded',
        'completed',
        'failed',
        'scheduled'
    );

DO $$ BEGIN
    CREATE TYPE finance_brand_asset_enum AS ENUM (
        'web_logo',          
        'print_logo',        
        'app_logo',          
        'digital_seal',      
        'authorized_sign',   
        'letterhead_banner',
        'watermark_logo'     
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE support_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE salary_advance_status_enum AS ENUM ('requested', 'approved', 'disbursed', 'deducted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payroll_payment_status_enum AS ENUM ('draft', 'processed', 'paid', 'on_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 2: CORE BASE TABLES (45 Tables, Native UUID v7, Zero ALTER)
-- ============================================================

-- ============================================================
-- TABLE  1: addresses
-- Purpose : Physical street addresses for customers, guardians, staff, and offices
-- ============================================================
CREATE TABLE addresses (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    house_no                  VARCHAR(50)         DEFAULT NULL,
    street                    VARCHAR(100)        DEFAULT NULL,
    street_name               VARCHAR(100)        DEFAULT NULL,
    village                   VARCHAR(100)        DEFAULT NULL,
    land_mark                 VARCHAR(100)        DEFAULT NULL,
    address                   VARCHAR(225)        DEFAULT NULL,
    city                      VARCHAR(100)        DEFAULT NULL,
    district                  VARCHAR(100)        DEFAULT NULL,
    state                     VARCHAR(100)        DEFAULT NULL,
    pincode                   VARCHAR(10)         DEFAULT NULL,
    location                  VARCHAR(255)        DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude                  DECIMAL(10,7)       DEFAULT NULL,
    longitude                 DECIMAL(10,7)       DEFAULT NULL,
    label                     VARCHAR(20)         DEFAULT NULL,
    PRIMARY KEY (id)
);

-- Indexes for addresses
CREATE INDEX IF NOT EXISTS idx_addresses_city ON addresses (city);
CREATE INDEX IF NOT EXISTS idx_addresses_created_at ON addresses (created_at);
CREATE INDEX IF NOT EXISTS idx_addresses_district ON addresses (district);
CREATE INDEX IF NOT EXISTS idx_addresses_pincode ON addresses (pincode);
CREATE INDEX IF NOT EXISTS idx_addresses_state ON addresses (state);
CREATE INDEX IF NOT EXISTS idx_addresses_state_city ON addresses (state, city);
CREATE INDEX IF NOT EXISTS idx_addresses_village ON addresses (village);
CREATE INDEX IF NOT EXISTS idx_ft_address ON addresses USING gin (to_tsvector('simple', COALESCE(address, '')));
CREATE INDEX IF NOT EXISTS idx_ft_city_district ON addresses USING gin (to_tsvector('simple', COALESCE(city, '') || ' ' || COALESCE(district, '')));


-- ============================================================
-- TABLE  2: address_history
-- Purpose : Historical audit trail of address changes
-- ============================================================
CREATE TABLE address_history (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    entity_type               address_entity_type_enum    NOT NULL,
    entity_id                 VARCHAR(50)         NOT NULL,
    address_id                UUID                 NOT NULL,
    is_current                SMALLINT            DEFAULT 1,
    changed_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_address_history_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE
);

-- Indexes for address_history
CREATE INDEX IF NOT EXISTS idx_ah_address_id ON address_history (address_id);
CREATE INDEX IF NOT EXISTS idx_ah_changed_at ON address_history (changed_at);
CREATE INDEX IF NOT EXISTS idx_ah_entity_address ON address_history (entity_type, entity_id, address_id);
CREATE INDEX IF NOT EXISTS idx_ah_entity_type_id ON address_history (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ah_is_current ON address_history (is_current);


-- ============================================================
-- TABLE  3: customer_accounts
-- Purpose : Mobile app customer login accounts and authentication identities
-- ============================================================
CREATE TABLE customer_accounts (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    mobile_number             VARCHAR(15)         NOT NULL,
    country_code              VARCHAR(5)          NOT NULL DEFAULT '+91',
    full_name                 VARCHAR(100)        DEFAULT NULL,
    email                     VARCHAR(150)        DEFAULT NULL,
    dob                       DATE,
    is_profile_complete       BOOLEAN             NOT NULL DEFAULT false,
    push_notifications_consent BOOLEAN             NOT NULL DEFAULT false,
    location_tracking_consent BOOLEAN             NOT NULL DEFAULT false,
    biometric_lock_enabled    BOOLEAN             NOT NULL DEFAULT false,
    is_active                 BOOLEAN             NOT NULL DEFAULT true,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT customer_accounts_mobile_number_key UNIQUE (mobile_number)
);

-- Indexes for customer_accounts
CREATE INDEX IF NOT EXISTS idx_customer_accounts_active ON customer_accounts (is_active);


-- ============================================================
-- TABLE  4: app_payment_methods
-- Purpose : Saved customer payment methods for mobile app
-- ============================================================
CREATE TABLE app_payment_methods (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    method_type               online_pay_method_enum    NOT NULL,
    gateway_token             VARCHAR(255)        NOT NULL,
    display_label             VARCHAR(100)        NOT NULL,
    masked_identifier         VARCHAR(50)         DEFAULT NULL,
    issuer_name               VARCHAR(100)        DEFAULT NULL,
    is_default                BOOLEAN             NOT NULL DEFAULT false,
    is_active                 BOOLEAN             NOT NULL DEFAULT true,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT app_payment_methods_customer_account_id_gateway_token_key UNIQUE (customer_account_id, gateway_token),
    CONSTRAINT fk_apm_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Indexes for app_payment_methods
CREATE INDEX IF NOT EXISTS idx_apm_account ON app_payment_methods (customer_account_id);


-- ============================================================
-- TABLE  5: kyc_documents
-- Purpose : Polymorphic storage and verification records for KYC identity files
-- ============================================================
CREATE TABLE kyc_documents (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    entity_type               kyc_entity_type_enum    NOT NULL,
    entity_id                 VARCHAR(50)         NOT NULL,
    document_type             kyc_document_type_enum    NOT NULL,
    side                      kyc_document_side_enum    NOT NULL DEFAULT 'single',
    file_name                 VARCHAR(255),
    file_path                 TEXT                NOT NULL,
    file_size                 BIGINT,
    mime_type                 VARCHAR(100),
    uploaded_by               VARCHAR(100),
    uploaded_by_type          kyc_uploader_type_enum    NOT NULL DEFAULT 'staff',
    uploaded_at               TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    is_current                BOOLEAN             NOT NULL DEFAULT true,
    verification_status       kyc_verification_status_enum    NOT NULL DEFAULT 'pending',
    verified_by               VARCHAR(100)        DEFAULT NULL,
    verified_at               TIMESTAMP,
    rejection_reason          VARCHAR(255)        DEFAULT NULL,
    remarks                   TEXT,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_kycdocs_side_valid CHECK ((document_type IN ('aadhar_card', 'driving_license', 'voter_id') AND side IN ('front', 'back')) OR (document_type NOT IN ('aadhar_card', 'driving_license', 'voter_id') AND side = 'single'))
);

-- Indexes for kyc_documents
CREATE INDEX IF NOT EXISTS idx_kycdocs_entity ON kyc_documents (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_kycdocs_entity_current ON kyc_documents (entity_type, entity_id, is_current);
CREATE INDEX IF NOT EXISTS idx_kycdocs_type ON kyc_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_kycdocs_type_side ON kyc_documents (document_type, side);
CREATE INDEX IF NOT EXISTS idx_kycdocs_uploaded_at ON kyc_documents (uploaded_at);
CREATE INDEX IF NOT EXISTS idx_kycdocs_uploader_type ON kyc_documents (uploaded_by_type);
CREATE INDEX IF NOT EXISTS idx_kycdocs_verification ON kyc_documents (verification_status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kycdocs_one_current ON kyc_documents (entity_type, entity_id, document_type, side) WHERE (is_current = true);


-- ============================================================
-- TABLE  6: notification_settings
-- Purpose : Customer notification preferences and push channels
-- ============================================================
CREATE TABLE notification_settings (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    sms_enabled               BOOLEAN             NOT NULL DEFAULT true,
    whatsapp_enabled          BOOLEAN             NOT NULL DEFAULT true,
    email_enabled             BOOLEAN             NOT NULL DEFAULT true,
    push_enabled              BOOLEAN             NOT NULL DEFAULT true,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT notification_settings_customer_account_id_key UNIQUE (customer_account_id),
    CONSTRAINT fk_notifsettings_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);


-- ============================================================
-- TABLE  7: notifications
-- Purpose : Operational push notifications sent to customers
-- ============================================================
CREATE TABLE notifications (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    type                      notification_type_enum    NOT NULL DEFAULT 'system',
    title                     VARCHAR(150)        NOT NULL,
    body                      VARCHAR(500)        DEFAULT NULL,
    deep_link                 VARCHAR(255)        DEFAULT NULL,
    is_read                   BOOLEAN             NOT NULL DEFAULT false,
    read_at                   TIMESTAMP,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_notif_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notif_account_unread ON notifications (customer_account_id, is_read, created_at DESC);


-- ============================================================
-- TABLE  8: otp_verifications
-- Purpose : One-time password verification tokens and expiration tracking
-- ============================================================
CREATE TABLE otp_verifications (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    mobile_number             VARCHAR(15)         NOT NULL,
    otp_hash                  VARCHAR(255)        NOT NULL,
    purpose                   VARCHAR(30)         NOT NULL DEFAULT 'login_or_signup',
    expires_at                TIMESTAMP           NOT NULL,
    is_verified               BOOLEAN             NOT NULL DEFAULT false,
    attempt_count             SMALLINT            DEFAULT 0 NOT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Indexes for otp_verifications
CREATE INDEX IF NOT EXISTS idx_otp_mobile_purpose ON otp_verifications (mobile_number, purpose, created_at DESC);


-- ============================================================
-- TABLE  9: owner
-- Purpose : Super administrative owner accounts of finance institutions
-- ============================================================
CREATE TABLE owner (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    username                  VARCHAR(100)        NOT NULL,
    password                  VARCHAR(255)        NOT NULL,
    reset_token               VARCHAR(255)        DEFAULT NULL,
    reset_token_expiry        TIMESTAMP,
    is_active                 SMALLINT            DEFAULT 1,
    license_id                VARCHAR(100)        NOT NULL DEFAULT 'UNLICENSED',
    active_subscription_id    UUID                DEFAULT NULL,
    referral_code             VARCHAR(30)         DEFAULT NULL,
    trial_used                BOOLEAN             NOT NULL DEFAULT false,
    max_customers_override    INT                 DEFAULT NULL,
    max_finances_override     INT                 DEFAULT NULL,
    max_users_override        INT                 DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT owner_username_key UNIQUE (username)
);

-- Indexes for owner
CREATE INDEX IF NOT EXISTS idx_owner_created_at ON owner (created_at);
CREATE INDEX IF NOT EXISTS idx_owner_is_active ON owner (is_active);
CREATE INDEX IF NOT EXISTS idx_owner_reset_token ON owner (reset_token);
CREATE INDEX IF NOT EXISTS idx_owner_reset_token_expiry ON owner (reset_token_expiry);
CREATE INDEX IF NOT EXISTS idx_owner_username_active ON owner (username, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_referral_code ON owner (referral_code) WHERE referral_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_license_id ON owner (license_id) WHERE license_id != 'UNLICENSED';
CREATE INDEX IF NOT EXISTS idx_owner_trial_used ON owner (trial_used);


-- ============================================================
-- TABLE 10: finance_detail
-- Purpose : Finance branch/institution profiles and business configurations
-- ============================================================
CREATE TABLE finance_detail (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                 NOT NULL,
    finance_name              VARCHAR(255)        NOT NULL,
    phone_numbers             JSONB               NOT NULL,
    emails                    JSONB,
    is_active                 SMALLINT            DEFAULT 1,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    since                     DATE         DEFAULT NULL,
    address_id                UUID                DEFAULT NULL,
    office_lat                DECIMAL(10,7)       DEFAULT NULL,
    office_lng                DECIMAL(10,7)       DEFAULT NULL,
    office_geofence_m         INT                 DEFAULT 200,

    PRIMARY KEY (id),
    CONSTRAINT fk_finance_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL,

    CONSTRAINT finance_detail_owner_id_finance_name_key UNIQUE (owner_id, finance_name),
    CONSTRAINT fk_finance_owner FOREIGN KEY (owner_id) REFERENCES owner(id)
);

-- Indexes for finance_detail
CREATE INDEX IF NOT EXISTS ft_finance_name ON finance_detail USING gin (to_tsvector('simple', finance_name));
CREATE INDEX IF NOT EXISTS idx_finance_created_at ON finance_detail (created_at);
CREATE INDEX IF NOT EXISTS idx_finance_is_active ON finance_detail (is_active);
CREATE INDEX IF NOT EXISTS idx_finance_owner_id ON finance_detail (owner_id);

-- ============================================================
-- TABLE : finance_branding_assets
-- Purpose : Multi-channel branding assets (Print, Web, Mobile App, Seals)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_branding_assets (
    id                    UUID                      NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                      NOT NULL,
    asset_type            finance_brand_asset_enum  NOT NULL, -- web_logo, print_logo, app_logo, etc.
    file_path             TEXT                      NOT NULL, -- Image URL or Storage Path (S3 / Local)
    file_name             VARCHAR(255)              DEFAULT NULL,
    mime_type             VARCHAR(100)              DEFAULT NULL, -- image/png, image/jpeg, image/svg+xml
    file_size_bytes       BIGINT                    DEFAULT NULL,
    
    -- Print / Display Settings
    dimensions_width      INT                       DEFAULT NULL, -- e.g. 512
    dimensions_height     INT                       DEFAULT NULL, -- e.g. 512
    display_name          VARCHAR(150)              DEFAULT NULL, -- e.g. "Primary Receipt Logo"
    
    is_active             BOOLEAN                   NOT NULL DEFAULT true,
    created_at            TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    CONSTRAINT fk_fba_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- ⭐ மிக முக்கியம்: ஒரு Finance-க்கு ஒரு குறிப்பிட்ட Asset Type-ல் ஒரு Active படம் மட்டுமே இருக்க வேண்டும்
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_active_branding_asset 
ON finance_branding_assets (finance_id, asset_type) 
WHERE is_active = true;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fba_finance_id ON finance_branding_assets (finance_id);
CREATE INDEX IF NOT EXISTS idx_fba_asset_type ON finance_branding_assets (finance_id, asset_type);


-- ============================================================
-- TABLE 11: godowns
-- Purpose : Vehicle storage warehouses and yards
-- ============================================================
CREATE TABLE godowns (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                 NOT NULL,
    finance_id                UUID,
    name                      VARCHAR(150)        NOT NULL,
    address                   VARCHAR(255)        DEFAULT NULL,
    city                      VARCHAR(100)        DEFAULT NULL,
    contact_person            VARCHAR(150)        DEFAULT NULL,
    contact_number            VARCHAR(20)         DEFAULT NULL,
    is_active                 SMALLINT            DEFAULT 1,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_godown_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_godown_owner FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE
);

-- Indexes for godowns
CREATE INDEX IF NOT EXISTS idx_godowns_finance ON godowns (finance_id);
CREATE INDEX IF NOT EXISTS idx_godowns_owner ON godowns (owner_id);


-- ============================================================
-- TABLE 12: office_expenses
-- Purpose : Daily operational office income and expenses
-- ============================================================
CREATE TABLE office_expenses (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    transaction_type          office_txn_type_enum    NOT NULL,
    expense_date              DATE                NOT NULL,
    category                  VARCHAR(255)        NOT NULL,
    description               VARCHAR(500)        DEFAULT NULL,
    amount                    DECIMAL(15,2)       NOT NULL,
    entered_by                VARCHAR(150)        NOT NULL,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT office_expenses_ibfk_1 FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Indexes for office_expenses
CREATE INDEX IF NOT EXISTS idx_oe_category ON office_expenses (category);
CREATE INDEX IF NOT EXISTS idx_oe_entered_by ON office_expenses (entered_by);
CREATE INDEX IF NOT EXISTS idx_oe_expense_date ON office_expenses (expense_date);
CREATE INDEX IF NOT EXISTS idx_oe_finance_id ON office_expenses (finance_id);
CREATE INDEX IF NOT EXISTS idx_oe_transaction_type ON office_expenses (transaction_type);


-- ============================================================
-- TABLE 13: recent_activity
-- Purpose : Recent transaction and operational activity feed
-- ============================================================
CREATE TABLE recent_activity (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    type                      VARCHAR(50)         NOT NULL,
    reference_id              VARCHAR(100),
    description               TEXT,
    amount                    DECIMAL(15,2),
    created_by                VARCHAR(100),
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT recent_activity_finance_id_fkey FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Indexes for recent_activity
CREATE INDEX IF NOT EXISTS idx_recent_activity_created_at ON recent_activity (created_at);
CREATE INDEX IF NOT EXISTS idx_recent_activity_finance_date ON recent_activity (finance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recent_activity_finance_id ON recent_activity (finance_id);


-- ============================================================
-- TABLE 14: referrals
-- Purpose : Customer referral program codes, invites, and conversion tracking
-- ============================================================
CREATE TABLE referrals (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    referrer_customer_account_id UUID                 NOT NULL,
    referral_code             VARCHAR(20)         NOT NULL,
    referred_mobile_number    VARCHAR(15)         DEFAULT NULL,
    referred_customer_account_id UUID,
    status                    referral_status_enum    NOT NULL DEFAULT 'pending',
    reward_points             INT                 DEFAULT 0 NOT NULL,
    completed_at              TIMESTAMP,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT referrals_referral_code_key UNIQUE (referral_code),
    CONSTRAINT fk_referral_referred FOREIGN KEY (referred_customer_account_id) REFERENCES customer_accounts(id) ON DELETE SET NULL,
    CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referrals (referrer_customer_account_id);


-- ============================================================
-- TABLE 17: users
-- Purpose : Back-office staff, admin, and agent user credentials
-- ============================================================
CREATE TABLE users (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    email                     VARCHAR(255)        NOT NULL,
    username                  VARCHAR(100)        NOT NULL,
    phone_no                  VARCHAR(15)         NOT NULL,
    password                  VARCHAR(255)        NOT NULL,
    is_active                 SMALLINT            DEFAULT 1,
    reset_token               VARCHAR(255)        DEFAULT NULL,
    reset_token_expiry        TIMESTAMP,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_phone_no_key UNIQUE (phone_no),
    CONSTRAINT users_username_key UNIQUE (username)
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);


-- ============================================================
-- TABLE 18: user_allowed_companies
-- Purpose : Normalized Many-to-Many junction mapping users to authorized finance companies with company-scoped roles and login hours
-- ============================================================
CREATE TABLE user_allowed_companies (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    user_id                   UUID                NOT NULL,
    finance_id                UUID                NOT NULL,
    role                      user_role_enum      NOT NULL DEFAULT 'agent',
    login_time_from           TIME                DEFAULT NULL,
    login_time_to             TIME                DEFAULT NULL,
    last_accessed_at          TIMESTAMP           DEFAULT NULL,
    assigned_at               TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active                 SMALLINT            NOT NULL DEFAULT 1,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT user_allowed_companies_user_finance_key UNIQUE (user_id, finance_id),
    CONSTRAINT fk_uac_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uac_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Indexes for user_allowed_companies
CREATE INDEX IF NOT EXISTS idx_uac_user_id ON user_allowed_companies (user_id);
CREATE INDEX IF NOT EXISTS idx_uac_finance_id ON user_allowed_companies (finance_id);
CREATE INDEX IF NOT EXISTS idx_uac_user_active ON user_allowed_companies (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_uac_user_fin_active ON user_allowed_companies (user_id, finance_id, is_active);
CREATE INDEX IF NOT EXISTS idx_uac_finance_role ON user_allowed_companies (finance_id, role, is_active);


-- ============================================================
-- TABLE 15: refresh_tokens
-- Purpose : JWT auth refresh tokens for mobile and web sessions
-- ============================================================
CREATE TABLE refresh_tokens (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    token_hash                VARCHAR(255)        NOT NULL,
    device_id                 VARCHAR(150)        DEFAULT NULL,
    device_name               VARCHAR(150)        DEFAULT NULL,
    platform                  VARCHAR(20)         DEFAULT NULL,
    issued_at                 TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at                TIMESTAMP           NOT NULL,
    revoked_at                TIMESTAMP,
    last_used_at              TIMESTAMP,
    user_id                   UUID                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_refresh_token_owner CHECK (
        (customer_account_id IS NOT NULL AND user_id IS NULL) OR
        (customer_account_id IS NULL AND user_id IS NOT NULL)
    ),

    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash),
    CONSTRAINT fk_refresh_tokens_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Indexes for refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account ON refresh_tokens (customer_account_id);


-- ============================================================
-- TABLE 16: rewards_ledger
-- Purpose : Customer loyalty rewards points ledger (earned/redeemed)
-- ============================================================
CREATE TABLE rewards_ledger (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    txn_type                  rewards_txn_type_enum    NOT NULL,
    points                    INT                 NOT NULL,
    balance_after             INT                 NOT NULL,
    reference_type            VARCHAR(50)         DEFAULT NULL,
    reference_id              INT,
    description               VARCHAR(255)        DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_rewards_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Indexes for rewards_ledger
CREATE INDEX IF NOT EXISTS idx_rewards_account ON rewards_ledger (customer_account_id, created_at DESC);


-- ============================================================
-- TABLE 18: support_tickets
-- Purpose : Customer support inquiries and issue tracking
-- ============================================================
CREATE TABLE support_tickets (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    category                  VARCHAR(100)        NOT NULL,
    subject                   VARCHAR(150)        NOT NULL,
    description               TEXT,
    status                    support_ticket_status_enum    NOT NULL DEFAULT 'open',
    assigned_to               UUID,
    resolved_at               TIMESTAMP,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finance_id                UUID                DEFAULT NULL,
    ticket_number             VARCHAR(50)         DEFAULT NULL,
    priority                  support_priority_enum NOT NULL DEFAULT 'medium',
    resolved_by               UUID                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_ticket_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fk_ticket_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_staff FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for support_tickets
CREATE INDEX IF NOT EXISTS idx_ticket_account ON support_tickets (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON support_tickets (status);


-- ============================================================
-- TABLE 19: users_details
-- Purpose : Staff employee profiles, qualifications, and HR records
-- ============================================================
CREATE TABLE users_details (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    user_id                   UUID                DEFAULT NULL,
    finance_id                UUID                NOT NULL,
    staff_name                VARCHAR(255)        NOT NULL,
    staff_code                VARCHAR(50)         DEFAULT NULL,
    father_spouse_name        VARCHAR(255)        DEFAULT NULL,
    experience_years          INT                 DEFAULT 0,
    education_qualification   VARCHAR(255)        DEFAULT NULL,
    photo                     VARCHAR(255)        DEFAULT NULL,
    joining_date              DATE,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    basic_salary              DECIMAL(12,2)       DEFAULT 0.00,
    daily_allowance           DECIMAL(10,2)       DEFAULT 0.00,
    commission_percent        DECIMAL(5,2)        DEFAULT 0.00,
    bank_name                 VARCHAR(100)        DEFAULT NULL,
    bank_account_number       VARCHAR(50)         DEFAULT NULL,
    bank_ifsc                 VARCHAR(11)         DEFAULT NULL,
    pan_number                VARCHAR(10)         DEFAULT NULL,
    pf_number                 VARCHAR(30)         DEFAULT NULL,
    esi_number                VARCHAR(30)         DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT users_details_staff_code_finance_id_key UNIQUE (staff_code, finance_id),
    CONSTRAINT fk_users_details_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_users_details_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for users_details
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_details_user_finance ON users_details (user_id, finance_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ud_user_id ON users_details (user_id);
CREATE INDEX IF NOT EXISTS idx_ud_finance_created ON users_details (finance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ud_finance_id ON users_details (finance_id);
CREATE INDEX IF NOT EXISTS idx_ud_finance_joining_date ON users_details (finance_id, joining_date);
CREATE INDEX IF NOT EXISTS idx_ud_finance_staff_name ON users_details (finance_id, staff_name);
CREATE INDEX IF NOT EXISTS idx_ud_joining_date ON users_details (joining_date);
CREATE INDEX IF NOT EXISTS idx_ud_staff_code_finance_comp ON users_details (staff_code, finance_id, staff_name);
CREATE INDEX IF NOT EXISTS idx_ud_staff_name ON users_details (staff_name);


-- ============================================================
-- TABLE 20: vehicle_info
-- Purpose : Vehicle catalogue specifications (make, model, variant, technical specs)
-- ============================================================
CREATE TABLE vehicle_info (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    brand                     VARCHAR(100)        NOT NULL,
    model_name                VARCHAR(255)        NOT NULL,
    make_year                 SMALLINT            NOT NULL,
    fuel_type                 fuel_type_enum      NOT NULL,
    engine_capacity           VARCHAR(50)         NOT NULL,
    fuel_tank_capacity        VARCHAR(50)         DEFAULT NULL,
    max_torque                VARCHAR(50)         DEFAULT NULL,
    top_speed                 VARCHAR(50)         DEFAULT NULL,
    mileage                   VARCHAR(50)         DEFAULT NULL,
    transmission              transmission_enum,
    seating_capacity          INT,
    body_type                 body_type_enum,
    base_price                DECIMAL(12,2)       NOT NULL,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Indexes for vehicle_info
CREATE INDEX IF NOT EXISTS idx_vi_base_price ON vehicle_info (base_price);
CREATE INDEX IF NOT EXISTS idx_vi_body_type ON vehicle_info (body_type);
CREATE INDEX IF NOT EXISTS idx_vi_brand ON vehicle_info (brand);
CREATE INDEX IF NOT EXISTS idx_vi_brand_model ON vehicle_info (brand, model_name);
CREATE INDEX IF NOT EXISTS idx_vi_fuel_type ON vehicle_info (fuel_type);
CREATE INDEX IF NOT EXISTS idx_vi_make_year ON vehicle_info (make_year);
CREATE INDEX IF NOT EXISTS idx_vi_model_name ON vehicle_info (model_name);


-- ============================================================
-- TABLE 21: vehicle_detail
-- Purpose : Physical vehicle inventory records (chassis, engine, reg number, price)
-- ============================================================
CREATE TABLE vehicle_detail (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    vehicle_info_id           UUID,
    vehicle_number            VARCHAR(100)        NOT NULL,
    vehicle_modal             VARCHAR(10)         DEFAULT NULL,
    chassis_number            VARCHAR(255)        DEFAULT NULL,
    engine_number             VARCHAR(255)        DEFAULT NULL,
    num_owner                 INT                 DEFAULT 1,
    trip_driven               INT                 DEFAULT 0,
    color                     VARCHAR(100)        DEFAULT NULL,
    variant                   VARCHAR(100)        DEFAULT NULL,
    selling_price             DECIMAL(12,2)       DEFAULT NULL,
    emi_from                  DECIMAL(10,2)       DEFAULT NULL,
    base_price                DECIMAL(12,2)       NOT NULL,
    final_price               DECIMAL(12,2)       NOT NULL,
    status                    vehicle_status_enum    DEFAULT 'available',
    created_date              DATE,
    selling_date              DATE,
    deal_type                 deal_type_enum      NOT NULL,
    rc_holder                 rc_holder_enum      DEFAULT 'Company',
    rc_status                 rc_status_enum      DEFAULT 'original',
    fc_expiry_date            DATE,
    insurance_expiry_date     DATE,
    remarks                   TEXT,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    minimum_down_payment      DECIMAL(12,2)       DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT vehicle_detail_chassis_number_key UNIQUE (chassis_number),
    CONSTRAINT vehicle_detail_engine_number_key UNIQUE (engine_number),
    CONSTRAINT vehicle_detail_vehicle_number_key UNIQUE (vehicle_number),
    CONSTRAINT fk_vehicle_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id),
    CONSTRAINT fk_vehicle_info FOREIGN KEY (vehicle_info_id) REFERENCES vehicle_info(id) ON DELETE SET NULL
);

-- Indexes for vehicle_detail
CREATE INDEX IF NOT EXISTS idx_vd_created_date ON vehicle_detail (created_date);
CREATE INDEX IF NOT EXISTS idx_vd_finance_id ON vehicle_detail (finance_id);
CREATE INDEX IF NOT EXISTS idx_vd_selling_date ON vehicle_detail (selling_date);
CREATE INDEX IF NOT EXISTS idx_vd_status ON vehicle_detail (status);
CREATE INDEX IF NOT EXISTS idx_vd_vehicle_info ON vehicle_detail (vehicle_info_id);
CREATE INDEX IF NOT EXISTS idx_vd_vehicle_prefix ON vehicle_detail ("left"(vehicle_number, 2));
CREATE INDEX IF NOT EXISTS idx_vehicle_minimum_down_payment ON vehicle_detail (minimum_down_payment);


-- ============================================================
-- TABLE 22: customers
-- Purpose : Customer master ledger records for financing deals
-- ============================================================
CREATE TABLE customers (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    hplno                     INT,
    loan_status              loan_status_enum    NOT NULL,
    broker_name              VARCHAR(100)        DEFAULT NULL,
    cname                     VARCHAR(100)        NOT NULL,
    cfname_value              VARCHAR(100)        DEFAULT NULL,
    cfname_unit               VARCHAR(10)         DEFAULT NULL,
    vehicle_id                UUID,
    aadhar_id                 VARCHAR(12)         DEFAULT NULL,
    other_govt_id_type        govt_id_type_enum,
    other_govt_id_number      VARCHAR(50)         DEFAULT NULL,
    profession                VARCHAR(100)        DEFAULT NULL,
    work_office_address       TEXT,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    home_latitude             DECIMAL(10,7)       DEFAULT NULL,
    home_longitude            DECIMAL(10,7)       DEFAULT NULL,
    home_address              TEXT                DEFAULT NULL,
    current_address           TEXT                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT ux_customers_finance_aadhar UNIQUE (finance_id, aadhar_id),
    CONSTRAINT fk_customers_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_customers_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL
);

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_finance_hplno ON customers (finance_id, hplno);
CREATE INDEX IF NOT EXISTS idx_customers_loan_status ON customers (loan_status);
CREATE INDEX IF NOT EXISTS idx_customers_vehicle_id ON customers (vehicle_id);


-- ============================================================
-- TABLE 23: contacts
-- Purpose : Customer and guardian phone numbers (mobile, landline, work)
-- ============================================================
CREATE TABLE contacts (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_id               UUID                 NOT NULL,
    contact_type              contact_entity_type_enum    NOT NULL,
    type                      contact_number_type_enum    NOT NULL,
    number                    VARCHAR(20)         NOT NULL,
    finance_id                UUID,
    PRIMARY KEY (id),
    CONSTRAINT contacts_customer_id_number_contact_type_key UNIQUE (customer_id, number, contact_type),
    CONSTRAINT fk_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_contacts_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts (contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_customer_type ON contacts (customer_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_finance_id ON contacts (finance_id);
CREATE INDEX IF NOT EXISTS idx_contacts_number ON contacts (number);


-- ============================================================
-- TABLE 24: guardians
-- Purpose : Guarantor / guardian profiles and relationship details for loans
-- ============================================================
CREATE TABLE guardians (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    customer_id               UUID                 NOT NULL,
    gname                     VARCHAR(100)        NOT NULL,
    gfname_value              VARCHAR(100)        DEFAULT NULL,
    gfname_unit               VARCHAR(10)         DEFAULT NULL,
    aadhar_id                 VARCHAR(12)         DEFAULT NULL,
    other_govt_id_type        govt_id_type_enum,
    other_govt_id_number      VARCHAR(50)         DEFAULT NULL,
    profession                VARCHAR(100)        DEFAULT NULL,
    remarks                   VARCHAR(100)        DEFAULT NULL,
    work_office_address       TEXT,
    PRIMARY KEY (id),
    CONSTRAINT ux_guardians_customer_aadhar UNIQUE (customer_id, aadhar_id),
    CONSTRAINT fk_guardians_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_guardians_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL
);

-- Indexes for guardians
CREATE INDEX IF NOT EXISTS ft_gname ON guardians USING gin (to_tsvector('simple', gname));
CREATE INDEX IF NOT EXISTS idx_guardians_customer_id ON guardians (customer_id);
CREATE INDEX IF NOT EXISTS idx_guardians_finance_customer ON guardians (finance_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_guardians_finance_id ON guardians (finance_id);
CREATE INDEX IF NOT EXISTS idx_guardians_profession ON guardians (profession);


-- ============================================================
-- TABLE 25: history_entries
-- Purpose : Customer interaction history logs (calls, RC submissions)
-- ============================================================
CREATE TABLE history_entries (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    customer_id               UUID                 NOT NULL,
    entry_type                history_entry_type_enum    NOT NULL,
    message                   TEXT                NOT NULL,
    entry_date                DATE                NOT NULL,
    created_by                VARCHAR(255)        DEFAULT NULL,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_history_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_history_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL
);

-- Indexes for history_entries
CREATE INDEX IF NOT EXISTS ft_message ON history_entries USING gin (to_tsvector('simple', message));
CREATE INDEX IF NOT EXISTS idx_he_created_at ON history_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_he_customer_date ON history_entries (customer_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_he_customer_id ON history_entries (customer_id);
CREATE INDEX IF NOT EXISTS idx_he_entry_date ON history_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_he_entry_type ON history_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_he_finance_customer ON history_entries (finance_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_he_finance_id ON history_entries (finance_id);


-- ============================================================
-- TABLE 26: loans
-- Purpose : Disbursed loans, EMI schedules, and repayment contracts
-- ============================================================
CREATE TABLE loans (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    customer_id               UUID                 NOT NULL,
    vehicle_id                UUID                DEFAULT NULL,
    loan_type                 VARCHAR(50)         NOT NULL,
    hp_amount                DECIMAL(15,2)       DEFAULT NULL,
    hp_date                  DATE,
    due_date                  DATE,
    due_month                INT,
    interest_rate            DECIMAL(5,2)        DEFAULT NULL,
    penalty_amount           DECIMAL(15,2)       DEFAULT NULL,
    penalty_days              INT                 DEFAULT 0 NOT NULL,
    principle_part            DECIMAL(15,2)       DEFAULT NULL,
    interest_part             DECIMAL(15,2)       DEFAULT NULL,
    due_amount               DECIMAL(15,2)       DEFAULT NULL,
    down_payment              DECIMAL(15,2)       DEFAULT NULL,
    net_payment               DECIMAL(15,2)       DEFAULT NULL,
    net_payable               DECIMAL(15,2)       DEFAULT NULL,
    pay_mode_1_amount         DECIMAL(15,2)       DEFAULT NULL,
    hand_loan                 DECIMAL(15,2)       DEFAULT NULL,
    hand_loan_remarks         TEXT,
    broker_name               VARCHAR(100)        DEFAULT NULL,
    dealer_name               VARCHAR(100)        DEFAULT NULL,
    documentation_charge      DECIMAL(15,2)       DEFAULT NULL,
    broker_commission         DECIMAL(15,2)       DEFAULT NULL,
    remarks                   TEXT,
    disbursement_voucher_id   UUID                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_loans_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_loans_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE SET NULL
);

-- Indexes for loans
CREATE INDEX IF NOT EXISTS idx_loans_broker_name ON loans (broker_name);
CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans (customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_dealer_name ON loans (dealer_name);
CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans (due_date);
CREATE INDEX IF NOT EXISTS idx_loans_finance_customer ON loans (finance_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_hp_date ON loans (hp_date);
CREATE INDEX IF NOT EXISTS idx_loans_vehicle_id ON loans (vehicle_id);


-- ============================================================
-- TABLE 27: auto_debit_mandates
-- Purpose : Bank auto-debit (eNACH / UPI mandate) registrations for EMIs
-- ============================================================
CREATE TABLE auto_debit_mandates (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    loan_id                   UUID                 NOT NULL,
    payment_method_id         UUID,
    mandate_ref               VARCHAR(100)        DEFAULT NULL,
    max_amount                DECIMAL(12,2)       DEFAULT NULL,
    status                    mandate_status_enum    NOT NULL DEFAULT 'active',
    start_date                DATE,
    next_debit_date           DATE,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mandate_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_mandate_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_mandate_method FOREIGN KEY (payment_method_id) REFERENCES app_payment_methods(id) ON DELETE SET NULL
);

-- Indexes for auto_debit_mandates
CREATE INDEX IF NOT EXISTS idx_mandate_loan ON auto_debit_mandates (loan_id);


-- ============================================================
-- TABLE 28: delivery_checklist
-- Purpose : Vehicle handover checklist and delivery sign-offs
-- ============================================================
CREATE TABLE delivery_checklist (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    loan_id                   UUID                 NOT NULL,
    item                      checklist_item_enum    NOT NULL,
    is_completed              BOOLEAN             NOT NULL DEFAULT false,
    completed_at              TIMESTAMP,
    notes                     VARCHAR(255)        DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT delivery_checklist_loan_id_item_key UNIQUE (loan_id, item),
    CONSTRAINT fk_checklist_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);


-- ============================================================
-- TABLE 29: documents
-- Purpose : Loan documentation and agreement attachments
-- ============================================================
CREATE TABLE documents (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID,
    loan_id                   UUID,
    doc_type                  VARCHAR(100)        NOT NULL,
    status                    doc_status_enum     NOT NULL DEFAULT 'not_issued',
    file_url                  VARCHAR(500)        DEFAULT NULL,
    issued_at                 TIMESTAMP,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_doc_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_doc_account ON documents (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_doc_loan ON documents (loan_id);


-- ============================================================
-- TABLE 30: loan_applications
-- Purpose : Customer loan financing requests and approval pipeline
-- ============================================================
CREATE TABLE loan_applications (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    vehicle_detail_id         UUID                 NOT NULL,
    finance_id                UUID,
    status                    loan_application_status_enum    NOT NULL DEFAULT 'draft',
    relative_name             VARCHAR(100)        DEFAULT NULL,
    relation_type             relation_type_enum    NOT NULL DEFAULT 'S/O',
    alter_native_num          VARCHAR(15)         DEFAULT NULL,
    occupation_type           occupation_type_enum    NOT NULL DEFAULT 'salaried',
    occupation_other_type     VARCHAR(50)         DEFAULT NULL,
    occupation_name           VARCHAR(50)         DEFAULT NULL,
    monthly_income            DECIMAL(12,2)       DEFAULT NULL,
    payment_id                UUID,
    down_payment              DECIMAL(15,2)       DEFAULT NULL,
    outstanding_amount        DECIMAL(15,2)       DEFAULT NULL,
    interest_rate             DECIMAL(5,2)        DEFAULT NULL,
    tenure_months             SMALLINT,
    monthly_due_amount        DECIMAL(15,2)       DEFAULT NULL,
    first_due_date            DATE,
    due_month                 INT,
    visiting_date             DATE,
    visiting_time             TIME,
    pre_booking_amount        DECIMAL(12,2)       DEFAULT NULL,
    submitted_at              TIMESTAMP,
    decided_at                TIMESTAMP,
    rejection_reason          TEXT,
    converted_loan_id         UUID,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_to_user_id       UUID                DEFAULT NULL,
    approved_amount           DECIMAL(15,2)       DEFAULT NULL,
    approved_by               UUID                DEFAULT NULL,
    verification_notes        TEXT                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_loanapp_assigned_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_loanapp_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT chk_loanapp_amounts_nonneg CHECK ((down_payment IS NULL OR down_payment >= 0) AND (outstanding_amount IS NULL OR outstanding_amount >= 0) AND (interest_rate IS NULL OR interest_rate >= 0) AND (monthly_due_amount IS NULL OR monthly_due_amount >= 0) AND (pre_booking_amount IS NULL OR pre_booking_amount >= 0) AND (monthly_income IS NULL OR monthly_income >= 0) AND (tenure_months IS NULL OR tenure_months > 0)),
    CONSTRAINT chk_loanapp_due_month CHECK (due_month IS NULL OR (due_month >= 1 AND due_month <= 31)),
    CONSTRAINT fk_loanapp_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_loanapp_converted_loan FOREIGN KEY (converted_loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_loanapp_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_loanapp_vehicle FOREIGN KEY (vehicle_detail_id) REFERENCES vehicle_detail(id) ON DELETE RESTRICT
);

-- Note: "loan_applications.payment_id" logically references "mobile_down_payment(id)".
-- The mutual FK was omitted to enable clean, single-pass execution without schema alteration.

-- Indexes for loan_applications
CREATE INDEX IF NOT EXISTS idx_loanapp_account ON loan_applications (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_loanapp_status ON loan_applications (status);
CREATE INDEX IF NOT EXISTS idx_loanapp_vehicle ON loan_applications (vehicle_detail_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_loanapp_converted_loan ON loan_applications (converted_loan_id) WHERE (converted_loan_id IS NOT NULL);


-- ============================================================
-- TABLE 31: loan_cancellations
-- Purpose : Loan cancellation requests, approval status, and refund processing
-- ============================================================
CREATE TABLE loan_cancellations (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    loan_application_id       UUID,
    loan_id                   UUID,
    reason                    cancellation_reason_enum    NOT NULL,
    additional_details        TEXT,
    status                    cancellation_status_enum    NOT NULL DEFAULT 'requested',
    reservation_fee_refund    DECIMAL(12,2)       DEFAULT 0 NOT NULL,
    cancellation_fee          DECIMAL(12,2)       DEFAULT 0 NOT NULL,
    refund_method             VARCHAR(50)         DEFAULT NULL,
    requested_at              TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at              TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_cancel_target CHECK (loan_application_id IS NOT NULL OR loan_id IS NOT NULL),
    CONSTRAINT fk_cancel_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_cancel_loanapp FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE CASCADE
);

-- Indexes for loan_cancellations
CREATE INDEX IF NOT EXISTS idx_cancel_loan ON loan_cancellations (loan_id);
CREATE INDEX IF NOT EXISTS idx_cancel_status ON loan_cancellations (status);


-- ============================================================
-- TABLE 32: loan_terms_agreements
-- Purpose : Customer acceptance terms for pre-booking and loan agreements
-- ============================================================
CREATE TABLE loan_terms_agreements (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    loan_application_id       UUID,
    loan_id                   UUID,
    terms_type                terms_type_enum     NOT NULL,
    terms_version             VARCHAR(20)         NOT NULL,
    accepted                  BOOLEAN             NOT NULL DEFAULT true,
    accepted_at               TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address                VARCHAR(45)         DEFAULT NULL,
    device_info               VARCHAR(150)        DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_terms_target CHECK (loan_application_id IS NOT NULL OR loan_id IS NOT NULL),
    CONSTRAINT fk_terms_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_terms_loanapp FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE CASCADE
);

-- Indexes for loan_terms_agreements
CREATE INDEX IF NOT EXISTS idx_terms_loan ON loan_terms_agreements (loan_id);
CREATE INDEX IF NOT EXISTS idx_terms_loanapp ON loan_terms_agreements (loan_application_id);


-- ============================================================
-- TABLE 33: mob_customers
-- Purpose : Bridge link between mobile app customer accounts and back-office customers
-- ============================================================
CREATE TABLE mob_customers (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    customer_id               UUID                 NOT NULL,
    finance_id                UUID                 NOT NULL,
    aadhar_id                 VARCHAR(12)         NOT NULL,
    is_primary_link           BOOLEAN             NOT NULL DEFAULT false,
    linked_at                 TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT mob_customers_customer_id_key UNIQUE (customer_id),
    CONSTRAINT fk_mc_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_mc_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_mc_finance_aadhar FOREIGN KEY (finance_id, aadhar_id) REFERENCES customers(finance_id, aadhar_id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Indexes for mob_customers
CREATE INDEX IF NOT EXISTS idx_mc_aadhar ON mob_customers (aadhar_id);
CREATE INDEX IF NOT EXISTS idx_mc_account ON mob_customers (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_mc_finance ON mob_customers (finance_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mob_cust_single_primary ON mob_customers (customer_account_id) WHERE (is_primary_link = true);


-- ============================================================
-- TABLE 34: mobile_app_payment
-- Purpose : Digital online payments processed through mobile app gateway
-- ============================================================
CREATE TABLE mobile_app_payment (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_id               UUID                 NOT NULL,
    finance_id                UUID                 NOT NULL,
    amount                    DECIMAL(15,2)       NOT NULL,
    payment_for               VARCHAR(30)         DEFAULT 'due_payment',
    method                    online_pay_method_enum    NOT NULL,
    gateway_name              VARCHAR(50),
    gateway_order_id          VARCHAR(150),
    gateway_payment_id        VARCHAR(150),
    gateway_signature         VARCHAR(255),
    gateway_response          JSONB,
    status                    payment_transaction_status_enum    DEFAULT 'initiated',
    failure_reason            TEXT,
    paid_at                   TIMESTAMP,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT mobile_app_payment_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT mobile_app_payment_finance_id_fkey FOREIGN KEY (finance_id) REFERENCES finance_detail(id)
);

-- Indexes for mobile_app_payment
CREATE INDEX IF NOT EXISTS idx_map_customer_id ON mobile_app_payment (customer_id);
CREATE INDEX IF NOT EXISTS idx_map_finance_id ON mobile_app_payment (finance_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_map_gateway_payment_id ON mobile_app_payment (gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_map_status ON mobile_app_payment (status);


-- ============================================================
-- TABLE 35: mobile_down_payment
-- Purpose : Down payment transactions made for loan applications
-- ============================================================
CREATE TABLE mobile_down_payment (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    finance_id                UUID                 NOT NULL,
    loan_application_id       UUID,
    amount                    DECIMAL(15,2)       NOT NULL,
    method                    online_pay_method_enum    NOT NULL,
    gateway_name              VARCHAR(50),
    gateway_order_id          VARCHAR(150),
    gateway_payment_id        VARCHAR(150),
    gateway_signature         VARCHAR(255),
    gateway_response          JSONB,
    status                    payment_transaction_status_enum    DEFAULT 'initiated',
    failure_reason            TEXT,
    paid_at                   TIMESTAMP,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mdp_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_mdp_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id),
    CONSTRAINT fk_mdp_loanapp FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE SET NULL
);

-- Indexes for mobile_down_payment
CREATE INDEX IF NOT EXISTS idx_mdp_account ON mobile_down_payment (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_mdp_finance ON mobile_down_payment (finance_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mdp_gateway_payment_id ON mobile_down_payment (gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_mdp_loanapp ON mobile_down_payment (loan_application_id);
CREATE INDEX IF NOT EXISTS idx_mdp_status ON mobile_down_payment (status);


-- ============================================================
-- TABLE 36: payments
-- Purpose : Consolidated payment records linked to mobile transactions
-- ============================================================
CREATE TABLE payments (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    customer_id               UUID                 NOT NULL,
    due_date                 DATE,
    payment_date             DATE                NOT NULL,
    bill_number              VARCHAR(50)         DEFAULT NULL,
    amount                    DECIMAL(15,2)       DEFAULT NULL,
    status                    payment_status_enum    DEFAULT 'pending',
    payment_status            active_cancelled_enum    DEFAULT 'active',
    cancelled_by              VARCHAR(100)        DEFAULT NULL,
    penalty                   DECIMAL(15,2)       DEFAULT NULL,
    collected_by              VARCHAR(100)        DEFAULT NULL,
    is_approved               BOOLEAN             DEFAULT TRUE,
    approved_by_id            UUID                REFERENCES users(id) ON DELETE SET NULL,
    approved_at               TIMESTAMP           DEFAULT NULL,
    hand_loan                 DECIMAL(15,2)       DEFAULT NULL,
    hand_loan_remark          TEXT,
    payment_mode              pay_mode_enum       DEFAULT 'cash',
    payment_mode_1            pay_mode_enum       DEFAULT NULL,
    payment_mode_1_amount     DECIMAL(15,2)       DEFAULT NULL,
    remarks                   TEXT,
    edited_by                 VARCHAR(100)        DEFAULT NULL,
    edited_at                 TIMESTAMP,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    mobile_app_payment_id     UUID,
    collected_by_id           UUID                DEFAULT NULL,
    collection_id             UUID                DEFAULT NULL,
    voucher_id                UUID                DEFAULT NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_payments_collected_by_user FOREIGN KEY (collected_by_id) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fk_payments_mobile_app_payment FOREIGN KEY (mobile_app_payment_id) REFERENCES mobile_app_payment(id) ON DELETE SET NULL
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_finance_id ON payments (finance_id);
CREATE INDEX IF NOT EXISTS idx_payments_mobile_app_payment_id ON payments (mobile_app_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date);


-- ============================================================
-- TABLE 37: penalties
-- Purpose : Late fees and default penalties applied on overdue loans
-- ============================================================
CREATE TABLE penalties (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    loan_id                   UUID                 NOT NULL,
    overdue_days              INT                 NOT NULL,
    per_day_rate              DECIMAL(10,2)       DEFAULT NULL,
    base_penalty              DECIMAL(12,2)       NOT NULL,
    other_charges             DECIMAL(12,2)       DEFAULT 0 NOT NULL,
    total_penalty             DECIMAL(12,2)       NOT NULL,
    calculated_at             TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_payment_id        UUID,
    PRIMARY KEY (id),
    CONSTRAINT fk_penalty_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_penalty_settled_payment FOREIGN KEY (settled_payment_id) REFERENCES mobile_app_payment(id) ON DELETE SET NULL
);

-- Indexes for penalties
CREATE INDEX IF NOT EXISTS idx_penalty_loan ON penalties (loan_id);


-- ============================================================
-- TABLE 38: provider_reviews
-- Purpose : Customer satisfaction reviews and ratings for finance providers
-- ============================================================
CREATE TABLE provider_reviews (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    loan_id                   UUID                 NOT NULL,
    finance_id                UUID                 NOT NULL,
    rating                    SMALLINT            NOT NULL,
    review_text               VARCHAR(500)        DEFAULT NULL,
    is_pinned                 BOOLEAN             NOT NULL DEFAULT false,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT provider_reviews_customer_account_id_loan_id_key UNIQUE (customer_account_id, loan_id),
    CONSTRAINT chk_review_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT fk_review_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_review_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_review_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- Indexes for provider_reviews
CREATE INDEX IF NOT EXISTS idx_review_finance ON provider_reviews (finance_id);


-- ============================================================
-- TABLE 39: receipts
-- Purpose : Official digital payment receipts for down payments and EMI collections
-- ============================================================
CREATE TABLE receipts (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    down_payment_id           UUID,
    app_payment_id            UUID,
    receipt_number            VARCHAR(50)         NOT NULL,
    file_url                  VARCHAR(500)        DEFAULT NULL,
    generated_at              TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT receipts_app_payment_id_key UNIQUE (app_payment_id),
    CONSTRAINT receipts_down_payment_id_key UNIQUE (down_payment_id),
    CONSTRAINT receipts_receipt_number_key UNIQUE (receipt_number),
    CONSTRAINT chk_receipt_one_source CHECK ((down_payment_id IS NOT NULL AND app_payment_id IS NULL) OR (down_payment_id IS NULL AND app_payment_id IS NOT NULL)),
    CONSTRAINT fk_receipt_app_payment FOREIGN KEY (app_payment_id) REFERENCES mobile_app_payment(id) ON DELETE CASCADE,
    CONSTRAINT fk_receipt_down_payment FOREIGN KEY (down_payment_id) REFERENCES mobile_down_payment(id) ON DELETE CASCADE
);


-- ============================================================
-- TABLE 40: seizing_vehicle
-- Purpose : Vehicle repossession / seizure tracking and release status
-- ============================================================
CREATE TABLE seizing_vehicle (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    customer_id               UUID                 NOT NULL,
    vehicle_id                UUID                 NOT NULL,
    seizing_charge            DECIMAL(10,2)       NOT NULL,
    description               VARCHAR(255)        DEFAULT NULL,
    seized_by                 VARCHAR(150)        NOT NULL,
    seizing_date              DATE                NOT NULL,
    status                    seizing_status_enum    DEFAULT 'Pending',
    release_date              DATE,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    bill_number               VARCHAR(50)         DEFAULT NULL,
    godown_id                 UUID,
    PRIMARY KEY (id),
    CONSTRAINT fk_seizing_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_seizing_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_seizing_godown FOREIGN KEY (godown_id) REFERENCES godowns(id) ON DELETE SET NULL,
    CONSTRAINT fk_seizing_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE
);

-- Indexes for seizing_vehicle
CREATE INDEX IF NOT EXISTS idx_seizing_customer ON seizing_vehicle (customer_id);
CREATE INDEX IF NOT EXISTS idx_seizing_finance ON seizing_vehicle (finance_id);
CREATE INDEX IF NOT EXISTS idx_seizing_godown ON seizing_vehicle (godown_id);
CREATE INDEX IF NOT EXISTS idx_seizing_vehicle_id ON seizing_vehicle (vehicle_id);


-- ============================================================
-- TABLE 41: sub_due
-- Purpose : Detailed EMI installment breakdown and due date schedules
-- ============================================================
CREATE TABLE sub_due (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    customer_id               UUID                 NOT NULL,
    payment_id                UUID                 NOT NULL,
    bill_number               VARCHAR(50)         NOT NULL,
    payment_date              DATE                NOT NULL,
    paid_amount               DECIMAL(15,2)       NOT NULL,
    payment_mode              pay_mode_enum       DEFAULT 'cash',
    payment_mode_amount       DECIMAL(15,2)       DEFAULT NULL,
    payment_mode_1            pay_mode_enum       DEFAULT NULL,
    payment_mode_1_amount     DECIMAL(15,2)       DEFAULT NULL,
    status                    active_cancelled_enum    DEFAULT 'active',
    collected_by              VARCHAR(100)        DEFAULT NULL,
    cancelled_by              VARCHAR(100)        DEFAULT NULL,
    is_approved               BOOLEAN             DEFAULT TRUE,
    approved_by_id            UUID                REFERENCES users(id) ON DELETE SET NULL,
    approved_at               TIMESTAMP           DEFAULT NULL,
    edited_by                 VARCHAR(100)        DEFAULT NULL,
    edited_at                 TIMESTAMP,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    mobile_app_payment_id     UUID,
    PRIMARY KEY (id),
    CONSTRAINT fk_subdue_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_subdue_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_subdue_mobile_app_payment FOREIGN KEY (mobile_app_payment_id) REFERENCES mobile_app_payment(id) ON DELETE SET NULL
);

-- Indexes for sub_due
CREATE INDEX IF NOT EXISTS idx_subdue_customer_id ON sub_due (customer_id);
CREATE INDEX IF NOT EXISTS idx_subdue_finance_id ON sub_due (finance_id);
CREATE INDEX IF NOT EXISTS idx_subdue_mobile_app_payment_id ON sub_due (mobile_app_payment_id);
CREATE INDEX IF NOT EXISTS idx_subdue_payment_id ON sub_due (payment_id);


-- ============================================================
-- TABLE 42: vehicle_assured
-- Purpose : Vehicle quality assurance certifications and warranty inspections
-- ============================================================
CREATE TABLE vehicle_assured (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    vehicle_id                UUID                 NOT NULL,
    assurance_name            VARCHAR(150)        NOT NULL,
    remarks                   TEXT,
    created_by                UUID                 NOT NULL,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_vehicle_assurance UNIQUE (vehicle_id, assurance_name),
    CONSTRAINT fk_vehicle_assured_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vehicle_assured_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_vehicle_assured_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE
);

-- Indexes for vehicle_assured
CREATE INDEX IF NOT EXISTS idx_va_assurance_name ON vehicle_assured (assurance_name);
CREATE INDEX IF NOT EXISTS idx_va_created_by ON vehicle_assured (created_by);
CREATE INDEX IF NOT EXISTS idx_va_finance_id ON vehicle_assured (finance_id);
CREATE INDEX IF NOT EXISTS idx_va_vehicle_id ON vehicle_assured (vehicle_id);


-- ============================================================
-- TABLE 43: vehicle_expenses
-- Purpose : Reconditioning, repair, and transport expenses per vehicle
-- ============================================================
CREATE TABLE vehicle_expenses (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    vehicle_id                UUID                 NOT NULL,
    expense_date              DATE                NOT NULL,
    description               VARCHAR(500)        NOT NULL,
    amount                    DECIMAL(15,2)       DEFAULT NULL,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_expenses_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_expenses_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE
);

-- Indexes for vehicle_expenses
CREATE INDEX IF NOT EXISTS ft_ve_description ON vehicle_expenses USING gin (to_tsvector('simple', description));
CREATE INDEX IF NOT EXISTS idx_ve_amount ON vehicle_expenses (amount);
CREATE INDEX IF NOT EXISTS idx_ve_expense_date ON vehicle_expenses (expense_date);
CREATE INDEX IF NOT EXISTS idx_ve_finance_id ON vehicle_expenses (finance_id);
CREATE INDEX IF NOT EXISTS idx_ve_vehicle_date ON vehicle_expenses (vehicle_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_ve_vehicle_id ON vehicle_expenses (vehicle_id);


-- ============================================================
-- TABLE 44: vehicle_media
-- Purpose : Photos and video attachments for vehicle inventory
-- ============================================================
CREATE TABLE vehicle_media (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID,
    vehicle_id                UUID                 NOT NULL,
    media_url                 VARCHAR(500)        NOT NULL,
    media_type                vehicle_media_type_enum    NOT NULL,
    thumbnail_url             VARCHAR(500)        DEFAULT NULL,
    is_primary                SMALLINT            DEFAULT 0,
    file_size                 INT,
    duration_seconds          INT,
    upload_date               DATE                DEFAULT CURRENT_DATE,
    created_at                TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_media_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE SET NULL,
    CONSTRAINT fk_media_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE
);

-- Indexes for vehicle_media
CREATE INDEX IF NOT EXISTS idx_vm_finance_id ON vehicle_media (finance_id);
CREATE INDEX IF NOT EXISTS idx_vm_media_type ON vehicle_media (media_type);
CREATE INDEX IF NOT EXISTS idx_vm_primary ON vehicle_media (is_primary);
CREATE INDEX IF NOT EXISTS idx_vm_vehicle_id ON vehicle_media (vehicle_id);


-- ============================================================
-- TABLE 45: wishlist
-- Purpose : Customer saved/bookmarked vehicles in mobile app
-- ============================================================
CREATE TABLE wishlist (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    customer_account_id       UUID                 NOT NULL,
    vehicle_detail_id         UUID                 NOT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT wishlist_customer_account_id_vehicle_detail_id_key UNIQUE (customer_account_id, vehicle_detail_id),
    CONSTRAINT fk_wishlist_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlist_vehicle FOREIGN KEY (vehicle_detail_id) REFERENCES vehicle_detail(id) ON DELETE CASCADE
);

-- ============================================================
-- STORED PROCEDURES & TRIGGERS
-- ============================================================

-- Function: fn_auto_link_mob_customer
-- Purpose : Automatically links mobile app customer to back-office customer on Aadhar match
CREATE OR REPLACE FUNCTION fn_auto_link_mob_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_account_id INT;
  v_has_primary BOOLEAN;
BEGIN
  IF NEW.aadhar_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.finance_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM mob_customers WHERE customer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT mc.customer_account_id INTO v_customer_account_id
  FROM mob_customers mc
  JOIN customers c ON c.id = mc.customer_id
  WHERE c.aadhar_id = NEW.aadhar_id
  LIMIT 1;

  IF v_customer_account_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM mob_customers
      WHERE customer_account_id = v_customer_account_id AND is_primary_link
    ) INTO v_has_primary;

    INSERT INTO mob_customers (customer_account_id, customer_id, finance_id, aadhar_id, is_primary_link)
    VALUES (v_customer_account_id, NEW.id, NEW.finance_id, NEW.aadhar_id, NOT v_has_primary)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: trg_customers_auto_link on customers
DROP TRIGGER IF EXISTS trg_customers_auto_link ON customers;
CREATE TRIGGER trg_customers_auto_link
AFTER INSERT OR UPDATE OF aadhar_id ON customers
FOR EACH ROW
EXECUTE FUNCTION fn_auto_link_mob_customer();

-- ============================================================
-- End of AutoFinex Schema Definition
-- ============================================================


-- ============================================================
-- SECTION 3: EXTENSION TABLES (27 Tables, Native UUID v7, Zero ALTER)
-- ============================================================

-- Table 4.1: Dedicated Real-Time Customer Live GPS State (1-to-1 per customer)
CREATE TABLE IF NOT EXISTS customer_live_locations (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    customer_id           UUID                 NOT NULL UNIQUE,
    latitude              DECIMAL(10,7)       NOT NULL,
    longitude             DECIMAL(10,7)       NOT NULL,
    speed                 DECIMAL(5,2)        DEFAULT NULL, -- km/h
    heading               DECIMAL(5,2)        DEFAULT NULL, -- degrees 0-360
    accuracy              DECIMAL(6,2)        DEFAULT NULL, -- meters
    altitude              DECIMAL(7,2)        DEFAULT NULL, -- meters
    battery_level         SMALLINT            DEFAULT NULL, -- 0-100%
    is_online             BOOLEAN             NOT NULL DEFAULT true,
    distance_from_home    DECIMAL(8,2)        NOT NULL DEFAULT 0.00,
    risk_level            VARCHAR(20)         NOT NULL DEFAULT 'safe', -- safe, warning, high, critical
    risk_score            INT                 NOT NULL DEFAULT 0,
    device_id             VARCHAR(150)        DEFAULT NULL,
    device_model          VARCHAR(100)        DEFAULT NULL,
    last_ping_at          TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_cll_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Table 4.2: Live Agent GPS Coordinates (with device_id & device_model)
CREATE TABLE IF NOT EXISTS agent_locations (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    user_id               UUID                 NOT NULL,
    latitude              DECIMAL(10,7)       NOT NULL,
    longitude             DECIMAL(10,7)       NOT NULL,
    speed                 DECIMAL(5,2)        DEFAULT NULL,
    accuracy              DECIMAL(6,2)        DEFAULT NULL,
    device_id             VARCHAR(150)        DEFAULT NULL,
    device_model          VARCHAR(100)        DEFAULT NULL,
    battery_level         SMALLINT            DEFAULT NULL,
    is_online             BOOLEAN             NOT NULL DEFAULT true,
    last_updated_at       TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT agent_locations_user_id_key UNIQUE (user_id),
    CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table 4.3: Staff-Customer Physical Meeting & Visit Audit
CREATE TABLE IF NOT EXISTS staff_customer_visits (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    user_id               UUID                 NOT NULL,
    customer_id           UUID                 NOT NULL,
    meet_distance         DECIMAL(8,2)        NOT NULL DEFAULT 0.00,
    customer_lat          DECIMAL(10,7)       DEFAULT NULL,
    customer_lng          DECIMAL(10,7)       DEFAULT NULL,
    meeting_lat           DECIMAL(10,7)       NOT NULL,
    meeting_lng           DECIMAL(10,7)       NOT NULL,
    meeting_location      VARCHAR(255)        NOT NULL,
    visit_time            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    outcome               VARCHAR(150)        DEFAULT NULL,
    proof_photo_url       VARCHAR(500)        DEFAULT NULL,
    notes                 TEXT                DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_scv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_scv_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Table 4.4: Staff Login Session Audit (Office distance & duration)
CREATE TABLE IF NOT EXISTS agent_login_sessions (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    user_id               UUID                 NOT NULL,
    login_time            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_time           TIMESTAMP           DEFAULT NULL,
    duration_seconds      INT                 DEFAULT NULL,
    device_name           VARCHAR(150)        DEFAULT NULL,
    platform              VARCHAR(30)         DEFAULT NULL,
    ip_address            VARCHAR(45)         DEFAULT NULL,
    login_lat             DECIMAL(10,7)       DEFAULT NULL,
    login_lng             DECIMAL(10,7)       DEFAULT NULL,
    distance_from_office  DECIMAL(8,2)        DEFAULT NULL,
    location_label        VARCHAR(200)        DEFAULT NULL,
    location_source       VARCHAR(10)         NOT NULL DEFAULT 'none',
    location_accuracy_m   INT                 DEFAULT NULL,
    location_permission   VARCHAR(15)         DEFAULT NULL,
    ip_city               VARCHAR(100)        DEFAULT NULL,
    ip_region             VARCHAR(100)        DEFAULT NULL,
    ip_country            VARCHAR(10)         DEFAULT NULL,
    flagged               BOOLEAN             NOT NULL DEFAULT false,
    flag_reason           VARCHAR(100)        DEFAULT NULL,
    last_seen_at          TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    logout_reason         VARCHAR(20)         DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_als_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_als_open ON agent_login_sessions (last_seen_at) WHERE logout_time IS NULL;

-- ------------------------------------------------------------
-- Method 4.5: Live Customer Location Tracking Method
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_customer_live_location(
    p_customer_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_speed NUMERIC DEFAULT NULL,
    p_heading NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_altitude NUMERIC DEFAULT NULL,
    p_battery_level INT DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_device_model VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_home_lat NUMERIC;
    v_home_lng NUMERIC;
    v_dist NUMERIC := 0.00;
    v_is_home BOOLEAN := FALSE;
    v_risk_level VARCHAR(20) := 'safe';
    v_risk_score INT := 0;
BEGIN
    SELECT home_latitude, home_longitude INTO v_home_lat, v_home_lng
    FROM customers WHERE id = p_customer_id;

    IF v_home_lat IS NOT NULL AND v_home_lng IS NOT NULL THEN
        v_dist := fn_calculate_distance_km(v_home_lat, v_home_lng, p_latitude, p_longitude);
        v_is_home := (v_dist <= 0.20);
    END IF;

    IF v_dist > 50.0 THEN
        v_risk_level := 'critical';
    ELSIF v_dist > 25.0 THEN
        v_risk_level := 'high';
    ELSIF v_dist > 10.0 THEN
        v_risk_level := 'warning';
    ELSE
        v_risk_level := 'safe';
    END IF;

    v_risk_score := fn_get_customer_risk_score(p_customer_id);

    INSERT INTO customer_live_locations (
        customer_id, latitude, longitude,
        speed, heading, accuracy, altitude, battery_level,
        is_online, distance_from_home,
        risk_level, risk_score, device_id, device_model,
        last_ping_at, updated_at
    ) VALUES (
        p_customer_id, p_latitude, p_longitude,
        p_speed, p_heading, p_accuracy, p_altitude, p_battery_level,
        true, v_dist,
        v_risk_level, v_risk_score, p_device_id, p_device_model,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (customer_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        accuracy = EXCLUDED.accuracy,
        altitude = EXCLUDED.altitude,
        battery_level = EXCLUDED.battery_level,
        distance_from_home = EXCLUDED.distance_from_home,
        risk_level = EXCLUDED.risk_level,
        risk_score = EXCLUDED.risk_score,
        device_id = COALESCE(EXCLUDED.device_id, customer_live_locations.device_id),
        device_model = COALESCE(EXCLUDED.device_model, customer_live_locations.device_model),
        last_ping_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;

    RETURN jsonb_build_object(
        'status', 'success',
        'customer_id', p_customer_id,
        'distance_from_home_km', v_dist,
        'is_home', v_is_home,
        'risk_level', v_risk_level,
        'risk_score', v_risk_score,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

-- ------------------------------------------------------------
-- Method 4.6: Live Agent Location Tracking Method
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_agent_live_location(
    p_user_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_speed NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_device_model VARCHAR DEFAULT NULL,
    p_battery_level INT DEFAULT NULL,
    p_is_online BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO agent_locations (
        user_id, latitude, longitude, speed, accuracy,
        device_id, device_model, battery_level, is_online, last_updated_at
    ) VALUES (
        p_user_id, p_latitude, p_longitude, p_speed, p_accuracy,
        p_device_id, p_device_model, p_battery_level, p_is_online, CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        accuracy = EXCLUDED.accuracy,
        device_id = COALESCE(EXCLUDED.device_id, agent_locations.device_id),
        device_model = COALESCE(EXCLUDED.device_model, agent_locations.device_model),
        battery_level = EXCLUDED.battery_level,
        is_online = EXCLUDED.is_online,
        last_updated_at = CURRENT_TIMESTAMP;

    RETURN jsonb_build_object(
        'status', 'success',
        'user_id', p_user_id,
        'is_online', p_is_online,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

-- ------------------------------------------------------------

-- Table 5.1: Customer-to-Agent Active Assignments
CREATE TABLE IF NOT EXISTS customer_agent_assignments (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    customer_id           UUID                 NOT NULL,
    agent_id              UUID                 NOT NULL,
    assigned_by           UUID                 DEFAULT NULL,
    priority              assignment_priority_enum NOT NULL DEFAULT 'medium',
    status                assignment_status_enum NOT NULL DEFAULT 'pending',
    due_amount            DECIMAL(15,2)       NOT NULL DEFAULT 0.00,
    notes                 TEXT                DEFAULT NULL,
    target_date           DATE                DEFAULT NULL,
    assigned_at           TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at         TIMESTAMP           DEFAULT NULL,
    completed_at          TIMESTAMP           DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_caa_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_caa_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_caa_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_caa_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Ensure only ONE active assignment (pending/visited) exists per customer at a time
DROP INDEX IF EXISTS ux_caa_active_customer;
CREATE UNIQUE INDEX ux_caa_active_customer ON customer_agent_assignments (customer_id) WHERE (status IN ('pending', 'visited'));

-- Table 5.2: Assignment History Timeline Audit
CREATE TABLE IF NOT EXISTS assignment_history (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    assignment_id         UUID                 NOT NULL,
    finance_id            UUID                 NOT NULL,
    user_id              UUID                 NOT NULL,
    customer_id           UUID                 NOT NULL,
    status                assignment_status_enum NOT NULL,
    visit_outcome         VARCHAR(150)        DEFAULT NULL,
    notes                 TEXT                DEFAULT NULL,
    location_lat          DECIMAL(10,7)       DEFAULT NULL,
    location_lng          DECIMAL(10,7)       DEFAULT NULL,
    proof_photo_url       VARCHAR(500)        DEFAULT NULL,
    due_amount            DECIMAL(15,2)       DEFAULT NULL,
    changed_by            UUID                 DEFAULT NULL,
    changed_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ah_assignment FOREIGN KEY (assignment_id) REFERENCES customer_agent_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_ah_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ah_agent FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ah_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ah_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 5.3: Agent Territory / Geographic Area Allocation
CREATE TABLE IF NOT EXISTS agent_area_allocations (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    user_id               UUID                 NOT NULL,
    city                  VARCHAR(100)        NOT NULL,
    district              VARCHAR(100)        DEFAULT NULL,
    village               VARCHAR(100)        NOT NULL DEFAULT 'N/A',
    street_name           VARCHAR(150)        NOT NULL,
    is_primary            BOOLEAN             NOT NULL DEFAULT true,
    allocated_by          UUID                 DEFAULT NULL,
    allocated_at          TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT agent_area_allocations_finance_id_user_id_city_street_name_key UNIQUE (finance_id, user_id, city, street_name),
    CONSTRAINT fk_aaa_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_aaa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_aaa_allocated_by FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_invitations (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                NOT NULL,
    invited_by            UUID                NOT NULL,
    user_id               UUID                DEFAULT NULL,
    invite_token          VARCHAR(255)        NOT NULL UNIQUE,
    invitation_code       VARCHAR(50)         DEFAULT NULL UNIQUE,
    staff_code            VARCHAR(50)         DEFAULT NULL,
    assigned_role         user_role_enum      NOT NULL DEFAULT 'agent',
    status                invitation_status_enum NOT NULL DEFAULT 'pending',
    login_time_from       TIME                DEFAULT NULL,
    login_time_to         TIME                DEFAULT NULL,
    expires_at            TIMESTAMP           NOT NULL,
    accepted_at           TIMESTAMP           DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ai_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_finance_status ON agent_invitations (finance_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_user_status ON agent_invitations (user_id, status);

-- ------------------------------------------------------------
-- Method 5.5: Single Customer Agent Assignment
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assign_customer_to_agent(
    p_finance_id UUID,
    p_customer_id UUID,
    p_agent_id UUID,
    p_assigned_by UUID DEFAULT NULL,
    p_priority assignment_priority_enum DEFAULT 'medium',
    p_notes TEXT DEFAULT NULL,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan_id UUID := p_loan_id;
    v_due_amount DECIMAL(15,2) := 0.00;
    v_new_id UUID;
BEGIN
    IF v_loan_id IS NULL THEN
        SELECT id, COALESCE(due_amount, 0.00)
        INTO v_loan_id, v_due_amount
        FROM loans
        WHERE customer_id = p_customer_id
        ORDER BY id DESC LIMIT 1;
    ELSE
        SELECT COALESCE(due_amount, 0.00)
        INTO v_due_amount
        FROM loans WHERE id = v_loan_id;
    END IF;

    UPDATE customer_agent_assignments
    SET status = 'reassigned',
        unassigned_at = CURRENT_TIMESTAMP
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'visited');

    INSERT INTO customer_agent_assignments (
        finance_id, customer_id, agent_id, assigned_by,
        priority, status, due_amount, notes, assigned_at
    ) VALUES (
        p_finance_id, p_customer_id, p_agent_id, p_assigned_by,
        p_priority, 'pending', COALESCE(v_due_amount, 0.00), p_notes, CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'assignment_id', v_new_id,
        'customer_id', p_customer_id,
        'agent_id', p_agent_id,
        'due_amount', COALESCE(v_due_amount, 0.00),
        'priority', p_priority,
        'assigned_at', CURRENT_TIMESTAMP
    );
END;
$$;

-- ------------------------------------------------------------
-- Method 5.6: Bulk Customer Agent Assignment
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assign_bulk_customers_to_agent(
    p_finance_id UUID,
    p_customer_ids UUID[],
    p_agent_id UUID,
    p_assigned_by UUID DEFAULT NULL,
    p_priority assignment_priority_enum DEFAULT 'medium',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cust_id UUID;
    v_count INT := 0;
    v_assigned_ids UUID[] := '{}';
BEGIN
    FOREACH v_cust_id IN ARRAY p_customer_ids
    LOOP
        PERFORM fn_assign_customer_to_agent(
            p_finance_id, v_cust_id, p_agent_id, p_assigned_by, p_priority, p_notes
        );
        v_count := v_count + 1;
        v_assigned_ids := array_append(v_assigned_ids, v_cust_id);
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'assigned_count', v_count,
        'customer_ids', v_assigned_ids,
        'agent_id', p_agent_id,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

-- ------------------------------------------------------------
-- Method 5.7: Unassign Customer
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_unassign_customer(
    p_customer_id UUID,
    p_unassigned_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    UPDATE customer_agent_assignments
    SET status = 'failed',
        unassigned_at = CURRENT_TIMESTAMP,
        notes = CASE 
            WHEN p_reason IS NOT NULL THEN COALESCE(notes || ' | ', '') || 'Unassigned: ' || p_reason
            ELSE notes 
        END
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'visited');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'success',
        'unassigned_count', v_updated_count,
        'customer_id', p_customer_id,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;



-- ------------------------------------------------------------
-- View 4.7: Unified Customer Live Tracking View (Used by Track.tsx & LiveMap.tsx)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW vw_customer_live_tracking AS
SELECT 
    c.id AS customer_id,
    c.finance_id,
    f.finance_name,
    c.cname AS customer_name,
    c.hplno,
    vd.vehicle_number,
    c.home_latitude,
    c.home_longitude,
    c.home_address,
    cll.latitude AS current_latitude,
    cll.longitude AS current_longitude,
    COALESCE(cll.distance_from_home, 0.00) AS distance_from_home,
    COALESCE(cll.risk_level, 'safe') AS risk_level,
    COALESCE(cll.risk_score, 0) AS risk_score,
    COALESCE(cll.speed, 0.00) AS speed,
    cll.battery_level,
    cll.device_id,
    cll.device_model,
    cll.last_ping_at,
    caa.agent_id AS assigned_agent_id,
    u.username AS assigned_agent_name,
    caa.status AS assignment_status,
    COALESCE(l.hp_amount, 0.00) AS loan_amount,
    COALESCE(l.due_amount, 0.00) AS overdue_amount
FROM customers c
LEFT JOIN finance_detail f ON f.id = c.finance_id
LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
LEFT JOIN customer_live_locations cll ON cll.customer_id = c.id
LEFT JOIN customer_agent_assignments caa ON caa.customer_id = c.id AND caa.status IN ('pending', 'visited')
LEFT JOIN users u ON u.id = caa.agent_id
LEFT JOIN LATERAL (
    SELECT id, hp_amount, due_amount
    FROM loans
    WHERE customer_id = c.id
    ORDER BY id DESC
    LIMIT 1
) l ON true;

-- Table 6.1: Day-End Cash Reconciliation (Cash Variance)
CREATE TABLE IF NOT EXISTS cash_variance_records (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    agent_id              UUID                 NOT NULL,
    reconciliation_date   DATE                NOT NULL,
    expected_cash         DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (expected_cash >= 0),
    submitted_cash        DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (submitted_cash >= 0),
    variance_amount       DECIMAL(15,2)       GENERATED ALWAYS AS (expected_cash - submitted_cash) STORED,
    status                variance_status_enum NOT NULL DEFAULT 'pending',
    notes                 TEXT                DEFAULT NULL,
    verified_by           UUID                 DEFAULT NULL,
    verified_at           TIMESTAMP           DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT cash_variance_finance_agent_date_key UNIQUE (finance_id, agent_id, reconciliation_date),
    CONSTRAINT fk_cvr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_cvr_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cvr_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 6.2: Promise to Pay (PTP) Lifecycle
CREATE TABLE IF NOT EXISTS promise_to_pay (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    customer_id           UUID                 NOT NULL,
    user_id              UUID                 DEFAULT NULL,
    promised_amount       DECIMAL(15,2)       NOT NULL CHECK (promised_amount > 0),
    promised_date         DATE                NOT NULL,
    ptp_status            ptp_status_enum     NOT NULL DEFAULT 'pending',
    broken_count          INT                 NOT NULL DEFAULT 0,
    reason                VARCHAR(255)        DEFAULT NULL,
    note                  TEXT                DEFAULT NULL,
    last_follow_up_date   TIMESTAMP           DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ptp_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ptp_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ptp_agent FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 6.3: PTP Follow-Up Activity Logs
CREATE TABLE IF NOT EXISTS ptp_follow_ups (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    ptp_id                UUID                 NOT NULL,
    user_id               UUID                 NOT NULL,
    call_status           ptp_call_status_enum NOT NULL,
    notes                 TEXT                NOT NULL,
    next_follow_up_date   DATE                DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pfu_ptp FOREIGN KEY (ptp_id) REFERENCES promise_to_pay(id) ON DELETE CASCADE,
    CONSTRAINT fk_pfu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table 7.1: AI Conversation Sessions
CREATE TABLE IF NOT EXISTS ai_conversations (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 DEFAULT NULL,
    customer_account_id   UUID                 DEFAULT NULL,
    customer_id           UUID                 DEFAULT NULL,
    user_id               UUID                 DEFAULT NULL,
    channel               VARCHAR(30)         NOT NULL DEFAULT 'mobile_app',
    title                 VARCHAR(200)        DEFAULT NULL,
    sentiment             ai_sentiment_enum   NOT NULL DEFAULT 'neutral',
    status                ai_conversation_status_enum NOT NULL DEFAULT 'active',
    risk_score            INT                 DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    complaint_category    VARCHAR(100)        DEFAULT NULL,
    tags                  TEXT[]              DEFAULT '{}',
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_aic_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_aic_customer_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_aic_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_aic_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 7.2: Threaded AI Messages
CREATE TABLE IF NOT EXISTS ai_messages (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    conversation_id       UUID                 NOT NULL,
    sender_type           ai_sender_type_enum NOT NULL,
    message_text          TEXT                NOT NULL,
    payload               JSONB               DEFAULT NULL,
    sentiment             ai_sentiment_enum   DEFAULT NULL,
    tokens_used           INT                 DEFAULT 0,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_aim_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

-- Table 7.3: AI Persistent Customer Memory
CREATE TABLE IF NOT EXISTS ai_customer_memory (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    customer_id           UUID                 DEFAULT NULL,
    customer_account_id   UUID                 DEFAULT NULL,
    memory_category       ai_memory_category_enum NOT NULL,
    memory_key            VARCHAR(100)        DEFAULT NULL,
    memory_value          TEXT                NOT NULL,
    confidence_score      DECIMAL(4,3)        NOT NULL DEFAULT 1.000 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    is_active             BOOLEAN             NOT NULL DEFAULT true,
    source_conversation_id UUID                DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_memory_target CHECK (customer_id IS NOT NULL OR customer_account_id IS NOT NULL),
    CONSTRAINT fk_acm_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_acm_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_acm_conversation FOREIGN KEY (source_conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
);

-- Table 7.4: AI Operational Settings & Escalation Policies
CREATE TABLE IF NOT EXISTS ai_settings (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL UNIQUE,
    company_rules         JSONB               NOT NULL DEFAULT '{"leaveDate": null, "leaveReason": null, "notificationsEnabled": true}'::jsonb,
    system_instructions   TEXT                DEFAULT NULL,
    behavior_flags        JSONB               NOT NULL DEFAULT '{"autoReply": true, "paymentReminder": true, "followUpReminder": true, "escalationAlerts": true}'::jsonb,
    escalation_policy     JSONB               NOT NULL DEFAULT '{"negativeAction": "notify_admin", "noResponseHours": 24, "autoFollowUp": true}'::jsonb,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by            UUID                 DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_ais_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ais_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------

-- Table 7.5: AI Telecalling / Lead Calling Queue (LeadCalling.tsx)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_telecalling_leads (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    customer_id               UUID                 NOT NULL,
    days_overdue              INT                 NOT NULL DEFAULT 0,
    call_status               lead_call_status_enum NOT NULL DEFAULT 'uncalled',
    last_call_at              TIMESTAMP           DEFAULT NULL,
    last_call_duration        VARCHAR(30)         DEFAULT NULL, -- e.g. "1m 42s"
    duration_seconds          INT                 DEFAULT 0,
    call_outcome_note         TEXT                DEFAULT NULL,
    scheduled_time            TIMESTAMP           DEFAULT NULL,
    schedule_preset           VARCHAR(100)        DEFAULT NULL, -- e.g. "Tomorrow 10:00 AM"
    assigned_agent_id         UUID                 DEFAULT NULL,
    ptp_id                    UUID                 DEFAULT NULL, -- Linked Promise to Pay if customer promised
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_atl_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_atl_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_atl_agent FOREIGN KEY (assigned_agent_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_atl_ptp FOREIGN KEY (ptp_id) REFERENCES promise_to_pay(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------

-- Table 7.6: AI Telecalling Call Logs & Transcripts (LeadCalling.tsx)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_telecalling_call_logs (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    lead_id                   UUID                 NOT NULL,
    finance_id                UUID                 NOT NULL,
    customer_id               UUID                 NOT NULL,
    call_status               lead_call_status_enum NOT NULL,
    call_duration_seconds     INT                 NOT NULL DEFAULT 0,
    started_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at                  TIMESTAMP           DEFAULT NULL,
    transcript                JSONB               DEFAULT '[]'::jsonb, -- Array of { sender: "ai"|"customer", text: string, time: string }
    call_outcome_note         TEXT                DEFAULT NULL,
    disposition               VARCHAR(100)        DEFAULT NULL, -- 'ptp_confirmed', 'no_answer', 'callback_scheduled', 'dispute'
    audio_recording_url       VARCHAR(500)        DEFAULT NULL,
    caller_type               VARCHAR(30)         NOT NULL DEFAULT 'ai_bot', -- 'ai_bot' or 'agent'
    called_by_user_id         UUID                 DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_atcl_lead FOREIGN KEY (lead_id) REFERENCES ai_telecalling_leads(id) ON DELETE CASCADE,
    CONSTRAINT fk_atcl_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_atcl_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_atcl_user FOREIGN KEY (called_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Method 7.7: Record Telecall Outcome & Auto-Create PTP
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_telecall_outcome(
    p_lead_id UUID,
    p_call_status lead_call_status_enum,
    p_duration_seconds INT DEFAULT 0,
    p_outcome_note TEXT DEFAULT NULL,
    p_transcript JSONB DEFAULT '[]'::jsonb,
    p_disposition VARCHAR DEFAULT NULL,
    p_scheduled_time TIMESTAMP DEFAULT NULL,
    p_schedule_preset VARCHAR DEFAULT NULL,
    p_promised_amount DECIMAL(15,2) DEFAULT NULL,
    p_promised_date DATE DEFAULT NULL,
    p_called_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead RECORD;
    v_log_id UUID;
    v_ptp_id UUID := NULL;
    v_duration_str VARCHAR(30);
BEGIN
    SELECT * INTO v_lead FROM ai_telecalling_leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Lead not found');
    END IF;

    IF p_duration_seconds > 0 THEN
        v_duration_str := (p_duration_seconds / 60)::text || 'm ' || (p_duration_seconds % 60)::text || 's';
    ELSE
        v_duration_str := NULL;
    END IF;

    -- If customer promised to pay during the call, automatically create PTP
    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO promise_to_pay (
            finance_id, customer_id, user_id, promised_amount, promised_date,
            ptp_status, reason, note, created_at, updated_at
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, p_called_by_user_id,
            p_promised_amount, p_promised_date, 'pending', 'Promised via AI Telecall',
            p_outcome_note, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id INTO v_ptp_id;
    END IF;

    -- Update the lead in active calling queue
    UPDATE ai_telecalling_leads SET
        call_status = p_call_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = p_duration_seconds,
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE(p_scheduled_time, scheduled_time),
        schedule_preset = COALESCE(p_schedule_preset, schedule_preset),
        ptp_id = COALESCE(v_ptp_id, ptp_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lead_id;

    -- Log the individual call execution attempt
    INSERT INTO ai_telecalling_call_logs (
        lead_id, finance_id, customer_id, call_status,
        call_duration_seconds, started_at, ended_at, transcript,
        call_outcome_note, disposition, caller_type, called_by_user_id, created_at
    ) VALUES (
        p_lead_id, v_lead.finance_id, v_lead.customer_id, p_call_status,
        p_duration_seconds, CURRENT_TIMESTAMP - (p_duration_seconds || ' seconds')::INTERVAL, CURRENT_TIMESTAMP,
        p_transcript, p_outcome_note, p_disposition,
        CASE WHEN p_called_by_user_id IS NOT NULL THEN 'agent' ELSE 'ai_bot' END,
        p_called_by_user_id, CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_log_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'lead_id', p_lead_id,
        'call_log_id', v_log_id,
        'ptp_id', v_ptp_id,
        'call_status', p_call_status,
        'duration', v_duration_str,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

-- ------------------------------------------------------------
-- View 7.8: Unified AI Lead Calling Dashboard View (LeadCalling.tsx)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW vw_ai_lead_calling_list AS
SELECT 
    atl.id AS lead_id,
    atl.finance_id,
    f.finance_name,
    atl.customer_id,
    c.cname AS customer_name,
    c.cname AS customer_full_name,
    c.hplno AS hpl_number,
    COALESCE(
        (SELECT ct.number FROM contacts ct WHERE ct.customer_id = c.id ORDER BY ct.id ASC LIMIT 1),
        'N/A'
    ) AS phone,
    COALESCE(
        vi.brand || ' ' || vi.model_name,
        vd.vehicle_modal,
        'Vehicle'
    ) AS vehicle_model,
    vd.vehicle_number AS vehicle_plate,
    COALESCE(l.due_amount, 0.00) AS due_amount,
    l.due_date AS due_date,
    atl.days_overdue,
    atl.call_status,
    atl.last_call_at,
    atl.last_call_duration,
    atl.call_outcome_note,
    atl.scheduled_time,
    atl.schedule_preset,
    atl.ptp_id,
    u.username AS assigned_agent_name
FROM ai_telecalling_leads atl
JOIN finance_detail f ON f.id = atl.finance_id
JOIN customers c ON c.id = atl.customer_id
LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
LEFT JOIN LATERAL (
    SELECT id, due_amount, due_date
    FROM loans
    WHERE customer_id = c.id
    ORDER BY id DESC
    LIMIT 1
) l ON true
LEFT JOIN users u ON u.id = atl.assigned_agent_id;

-- Table 8.1: RSP Bank / NBFC Finance Plans
CREATE TABLE IF NOT EXISTS rsp_bank_master (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    bank_name             VARCHAR(150)        NOT NULL,
    interest_percent      DECIMAL(5,2)        NOT NULL CHECK (interest_percent >= 0),
    validity_months       INT                 NOT NULL CHECK (validity_months > 0),
    interest_after_validity DECIMAL(5,2)      NOT NULL CHECK (interest_after_validity >= 0),
    processing_charges    DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (processing_charges >= 0),
    appraiser_commission  DECIMAL(5,2)        NOT NULL DEFAULT 0.00 CHECK (appraiser_commission >= 0),
    min_amount            DECIMAL(15,2)       DEFAULT NULL CHECK (min_amount IS NULL OR min_amount >= 0),
    max_amount            DECIMAL(15,2)       DEFAULT NULL CHECK (max_amount IS NULL OR max_amount >= 0),
    is_active             BOOLEAN             NOT NULL DEFAULT true,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_rsp_amounts CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount),
    CONSTRAINT fk_rsp_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Table 8.2: Finance Company Settings & Series Configuration
CREATE TABLE IF NOT EXISTS finance_settings (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL UNIQUE,
    loan_prefix           VARCHAR(20)         NOT NULL DEFAULT 'HPL',
    loan_range_from       INT                 NOT NULL DEFAULT 1,
    loan_range_to         INT                 NOT NULL DEFAULT 99999,
    bill_prefix           VARCHAR(20)         NOT NULL DEFAULT 'BILL',
    bill_range_from       INT                 NOT NULL DEFAULT 1,
    bill_range_to         INT                 NOT NULL DEFAULT 99999,
    default_interest_rate DECIMAL(5,2)        NOT NULL DEFAULT 24.00 CHECK (default_interest_rate >= 0),
    penalty_per_day       DECIMAL(10,2)       NOT NULL DEFAULT 50.00 CHECK (penalty_per_day >= 0),
    penalty_grace_days    INT                 NOT NULL DEFAULT 7 CHECK (penalty_grace_days >= 0),
    document_charges      DECIMAL(15,2)       NOT NULL DEFAULT 500.00 CHECK (document_charges >= 0),
    broker_commission_percent DECIMAL(5,2)    NOT NULL DEFAULT 2.00 CHECK (broker_commission_percent >= 0),
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_fs_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Table 8.3: Company Bank Accounts
CREATE TABLE IF NOT EXISTS finance_bank_accounts (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    bank_name             VARCHAR(150)        NOT NULL,
    branch                VARCHAR(150)        DEFAULT NULL,
    ifsc_code             VARCHAR(11)         NOT NULL,
    account_name          VARCHAR(200)        NOT NULL,
    account_number        VARCHAR(50)         NOT NULL,
    upi_id                VARCHAR(100)        DEFAULT NULL,
    is_primary            BOOLEAN             NOT NULL DEFAULT false,
    is_active             BOOLEAN             NOT NULL DEFAULT true,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT finance_bank_accounts_finance_account_key UNIQUE (finance_id, account_number),
    CONSTRAINT fk_fba_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE
);

-- Table 9.1: QR Login Authentication Sessions
CREATE TABLE IF NOT EXISTS qr_login_sessions (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    session_token         VARCHAR(255)        NOT NULL UNIQUE,
    device_info           VARCHAR(255)        DEFAULT NULL,
    ip_address            VARCHAR(45)         DEFAULT NULL,
    status                qr_login_status_enum NOT NULL DEFAULT 'pending',
    authenticated_user_id UUID                 DEFAULT NULL,
    authenticated_account_id UUID              DEFAULT NULL,
    scanned_at            TIMESTAMP           DEFAULT NULL,
    authenticated_at      TIMESTAMP           DEFAULT NULL,
    expires_at            TIMESTAMP           NOT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_qr_auth_target CHECK (
        (authenticated_user_id IS NULL AND authenticated_account_id IS NULL) OR
        (authenticated_user_id IS NOT NULL AND authenticated_account_id IS NULL) OR
        (authenticated_user_id IS NULL AND authenticated_account_id IS NOT NULL)
    ),
    CONSTRAINT fk_qls_user FOREIGN KEY (authenticated_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_qls_account FOREIGN KEY (authenticated_account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);

-- Table 9.2: Dynamic QR Payment Requests
CREATE TABLE IF NOT EXISTS qr_payment_requests (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    finance_id            UUID                 NOT NULL,
    customer_id           UUID                 NOT NULL,
    loan_id               UUID                 DEFAULT NULL,
    agent_id              UUID                 DEFAULT NULL,
    amount                DECIMAL(15,2)       NOT NULL CHECK (amount > 0),
    qr_string             TEXT                NOT NULL,
    qr_ref                VARCHAR(100)        NOT NULL UNIQUE,
    status                qr_payment_status_enum NOT NULL DEFAULT 'generated',
    payment_id            UUID                 DEFAULT NULL,
    gateway_order_id      VARCHAR(150)        DEFAULT NULL,
    gateway_payment_id    VARCHAR(150)        DEFAULT NULL,
    expires_at            TIMESTAMP           NOT NULL,
    paid_at               TIMESTAMP           DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_qpr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_qpr_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_qpr_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
    CONSTRAINT fk_qpr_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_qpr_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- Table 10.1: Auto-Debit Execution History & Gateway Reconciliation
CREATE TABLE IF NOT EXISTS auto_debit_execution_logs (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    mandate_id            UUID                 NOT NULL,
    loan_id               UUID                 NOT NULL,
    scheduled_date        DATE                NOT NULL,
    execution_date        TIMESTAMP           DEFAULT NULL,
    debit_amount          DECIMAL(15,2)       NOT NULL CHECK (debit_amount > 0),
    provider_txn_id       VARCHAR(150)        DEFAULT NULL,
    utr_number            VARCHAR(100)        DEFAULT NULL,
    status                payment_transaction_status_enum NOT NULL DEFAULT 'initiated',
    retry_count           SMALLINT            NOT NULL DEFAULT 0,
    failure_reason        TEXT                DEFAULT NULL,
    payment_id            UUID                 DEFAULT NULL,
    webhook_response      JSONB               DEFAULT NULL,
    reconciled_at         TIMESTAMP           DEFAULT NULL,
    created_at            TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT auto_debit_exec_unique_trigger UNIQUE (mandate_id, scheduled_date, retry_count),
    CONSTRAINT fk_adel_mandate FOREIGN KEY (mandate_id) REFERENCES auto_debit_mandates(id) ON DELETE CASCADE,
    CONSTRAINT fk_adel_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_adel_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- Table 11.1: Loan Application Stage Transition History
CREATE TABLE IF NOT EXISTS loan_application_stage_history (
    id                    UUID                NOT NULL DEFAULT uuidv7(),
    loan_application_id   UUID                 NOT NULL,
    from_status           loan_application_status_enum DEFAULT NULL,
    to_status             loan_application_status_enum NOT NULL,
    changed_by            UUID                 DEFAULT NULL,
    remarks               TEXT                DEFAULT NULL,
    transitioned_at       TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_lash_app FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_lash_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 12.1: Staff Salary Structures (Base pay, DA, commission rates)
CREATE TABLE IF NOT EXISTS staff_salary_structures (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    user_id                   UUID                 NOT NULL,
    base_salary               DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (base_salary >= 0),
    daily_allowance           DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (daily_allowance >= 0),
    commission_percent        DECIMAL(5,2)        NOT NULL DEFAULT 0.00 CHECK (commission_percent >= 0),
    incentive_per_collection  DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (incentive_per_collection >= 0),
    pf_deduction              DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (pf_deduction >= 0),
    esi_deduction             DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (esi_deduction >= 0),
    bank_name                 VARCHAR(150)        DEFAULT NULL,
    bank_account_no           VARCHAR(50)         DEFAULT NULL,
    bank_ifsc                 VARCHAR(11)         DEFAULT NULL,
    pan_number                VARCHAR(20)         DEFAULT NULL,
    effective_from            DATE                NOT NULL DEFAULT CURRENT_DATE,
    is_active                 BOOLEAN             NOT NULL DEFAULT true,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sss_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_sss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Partial unique index ensuring at most one active salary structure per user per finance company
DROP INDEX IF EXISTS ux_sss_active_user_finance;
CREATE UNIQUE INDEX ux_sss_active_user_finance ON staff_salary_structures (finance_id, user_id) WHERE (is_active = true);

-- Table 12.2: Staff Salary Advances & Recovery Tracking
CREATE TABLE IF NOT EXISTS staff_salary_advances (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    user_id                   UUID                 NOT NULL,
    advance_amount            DECIMAL(15,2)       NOT NULL CHECK (advance_amount > 0),
    reason                    TEXT                DEFAULT NULL,
    requested_date            DATE                NOT NULL DEFAULT CURRENT_DATE,
    approved_by               UUID                 DEFAULT NULL,
    approved_date             DATE                DEFAULT NULL,
    disbursed_date            DATE                DEFAULT NULL,
    status                    salary_advance_status_enum NOT NULL DEFAULT 'requested',
    monthly_deduction_amount  DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (monthly_deduction_amount >= 0),
    remaining_balance         DECIMAL(15,2)       NOT NULL CHECK (remaining_balance >= 0),
    voucher_id                UUID                 DEFAULT NULL, -- Links to double-entry ledger (acc_vouchers)
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ssa_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_ssa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ssa_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Table 12.3: Staff Monthly Payroll Records (Itemized Payslips)
CREATE TABLE IF NOT EXISTS staff_payroll_records (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    finance_id                UUID                 NOT NULL,
    user_id                   UUID                 NOT NULL,
    payroll_month             VARCHAR(7)          NOT NULL, -- 'YYYY-MM'
    base_salary               DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (base_salary >= 0),
    total_working_days        SMALLINT            NOT NULL DEFAULT 30 CHECK (total_working_days > 0),
    present_days              SMALLINT            NOT NULL DEFAULT 30 CHECK (present_days >= 0),
    total_collections_count   INT                 NOT NULL DEFAULT 0,
    total_collection_amount   DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (total_collection_amount >= 0),
    commission_earned         DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (commission_earned >= 0),
    allowance_amount          DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (allowance_amount >= 0),
    bonus_amount              DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (bonus_amount >= 0),
    gross_salary              DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (gross_salary >= 0),
    advance_deduction         DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (advance_deduction >= 0),
    variance_deduction        DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (variance_deduction >= 0),
    pf_deduction              DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (pf_deduction >= 0),
    esi_deduction             DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (esi_deduction >= 0),
    other_deductions          DECIMAL(15,2)       NOT NULL DEFAULT 0.00 CHECK (other_deductions >= 0),
    net_salary                DECIMAL(15,2)       NOT NULL CHECK (net_salary >= 0),
    payment_status            payroll_payment_status_enum NOT NULL DEFAULT 'draft',
    payment_date              DATE                DEFAULT NULL,
    payment_mode              pay_mode_enum       DEFAULT 'bank',
    transaction_ref           VARCHAR(150)        DEFAULT NULL,
    voucher_id                UUID                 DEFAULT NULL, -- Links to double-entry ledger (acc_vouchers)
    processed_by              UUID                 DEFAULT NULL,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT staff_payroll_finance_user_month_key UNIQUE (finance_id, user_id, payroll_month),
    CONSTRAINT fk_spr_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_spr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_spr_processed_by FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Method 12.4: Monthly Staff Payroll Calculation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calculate_staff_monthly_payroll(
    p_finance_id UUID,
    p_user_id UUID,
    p_month VARCHAR(7), -- e.g. '2026-04'
    p_working_days INT DEFAULT 30,
    p_present_days INT DEFAULT 30,
    p_bonus DECIMAL(15,2) DEFAULT 0.00,
    p_processed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_base_salary DECIMAL(15,2) := 0.00;
    v_daily_allowance DECIMAL(10,2) := 0.00;
    v_comm_percent DECIMAL(5,2) := 0.00;
    v_incentive_per_col DECIMAL(10,2) := 0.00;
    v_pf DECIMAL(10,2) := 0.00;
    v_esi DECIMAL(10,2) := 0.00;

    v_total_col_count INT := 0;
    v_total_col_amount DECIMAL(15,2) := 0.00;
    v_commission_earned DECIMAL(15,2) := 0.00;
    v_allowance_amount DECIMAL(15,2) := 0.00;
    v_gross_salary DECIMAL(15,2) := 0.00;
    v_advance_deduction DECIMAL(15,2) := 0.00;
    v_variance_deduction DECIMAL(15,2) := 0.00;
    v_net_salary DECIMAL(15,2) := 0.00;
    v_payroll_id UUID;

    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_start_date := TO_DATE(p_month || '-01', 'YYYY-MM-DD');
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT base_salary, daily_allowance, commission_percent, incentive_per_collection, pf_deduction, esi_deduction
    INTO v_base_salary, v_daily_allowance, v_comm_percent, v_incentive_per_col, v_pf, v_esi
    FROM staff_salary_structures
    WHERE finance_id = p_finance_id AND user_id = p_user_id AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT COALESCE(basic_salary, 0.00), COALESCE(daily_allowance, 0.00), COALESCE(commission_percent, 0.00)
        INTO v_base_salary, v_daily_allowance, v_comm_percent
        FROM users_details
        WHERE finance_id = p_finance_id AND (id = p_user_id OR staff_name = (SELECT username FROM users WHERE id = p_user_id))
        LIMIT 1;
    END IF;

    -- Aggregate payments collected by this user during the month
    SELECT 
        COALESCE(COUNT(id), 0),
        COALESCE(SUM(amount), 0.00)
    INTO v_total_col_count, v_total_col_amount
    FROM payments
    WHERE collected_by_id = p_user_id
      AND payment_date >= v_start_date
      AND payment_date <= v_end_date;

    v_commission_earned := ROUND((v_total_col_amount * (v_comm_percent / 100.00)) + (v_total_col_count * v_incentive_per_col), 2);
    v_allowance_amount := ROUND(v_daily_allowance * p_present_days, 2);

    IF p_working_days > 0 THEN
        v_gross_salary := ROUND((v_base_salary / p_working_days) * p_present_days + v_commission_earned + v_allowance_amount + COALESCE(p_bonus, 0.00), 2);
    ELSE
        v_gross_salary := v_base_salary + v_commission_earned + v_allowance_amount + COALESCE(p_bonus, 0.00);
    END IF;

    -- Check outstanding salary advances for scheduled deduction
    SELECT COALESCE(SUM(LEAST(monthly_deduction_amount, remaining_balance)), 0.00)
    INTO v_advance_deduction
    FROM staff_salary_advances
    WHERE finance_id = p_finance_id
      AND user_id = p_user_id
      AND status = 'disbursed'
      AND remaining_balance > 0;

    -- Check cash variances
    SELECT COALESCE(SUM(GREATEST(0, variance_amount)), 0.00)
    INTO v_variance_deduction
    FROM cash_variance_records
    WHERE finance_id = p_finance_id
      AND agent_id = p_user_id
      AND reconciliation_date >= v_start_date
      AND reconciliation_date <= v_end_date
      AND status = 'variance';

    v_net_salary := GREATEST(0.00, v_gross_salary - (v_advance_deduction + v_variance_deduction + COALESCE(v_pf, 0.00) + COALESCE(v_esi, 0.00)));

    INSERT INTO staff_payroll_records (
        finance_id, user_id, payroll_month, base_salary,
        total_working_days, present_days, total_collections_count, total_collection_amount,
        commission_earned, allowance_amount, bonus_amount, gross_salary,
        advance_deduction, variance_deduction, pf_deduction, esi_deduction,
        net_salary, payment_status, processed_by, updated_at
    ) VALUES (
        p_finance_id, p_user_id, p_month, v_base_salary,
        p_working_days, p_present_days, v_total_col_count, v_total_col_amount,
        v_commission_earned, v_allowance_amount, COALESCE(p_bonus, 0.00), v_gross_salary,
        v_advance_deduction, v_variance_deduction, COALESCE(v_pf, 0.00), COALESCE(v_esi, 0.00),
        v_net_salary, 'draft', p_processed_by, CURRENT_TIMESTAMP
    )
    ON CONFLICT (finance_id, user_id, payroll_month) DO UPDATE SET
        base_salary = EXCLUDED.base_salary,
        total_working_days = EXCLUDED.total_working_days,
        present_days = EXCLUDED.present_days,
        total_collections_count = EXCLUDED.total_collections_count,
        total_collection_amount = EXCLUDED.total_collection_amount,
        commission_earned = EXCLUDED.commission_earned,
        allowance_amount = EXCLUDED.allowance_amount,
        bonus_amount = EXCLUDED.bonus_amount,
        gross_salary = EXCLUDED.gross_salary,
        advance_deduction = EXCLUDED.advance_deduction,
        variance_deduction = EXCLUDED.variance_deduction,
        pf_deduction = EXCLUDED.pf_deduction,
        esi_deduction = EXCLUDED.esi_deduction,
        net_salary = EXCLUDED.net_salary,
        processed_by = EXCLUDED.processed_by,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_payroll_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'payroll_id', v_payroll_id,
        'user_id', p_user_id,
        'month', p_month,
        'base_salary', v_base_salary,
        'collections_count', v_total_col_count,
        'collections_amount', v_total_col_amount,
        'commission_earned', v_commission_earned,
        'allowance_amount', v_allowance_amount,
        'gross_salary', v_gross_salary,
        'advance_deduction', v_advance_deduction,
        'variance_deduction', v_variance_deduction,
        'net_salary', v_net_salary
    );
END;
$$;

-- ------------------------------------------------------------
-- Method 12.5: Disburse Staff Salary
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_disburse_staff_salary(
    p_payroll_id UUID,
    p_disbursed_by UUID,
    p_payment_mode pay_mode_enum DEFAULT 'bank',
    p_transaction_ref VARCHAR(150) DEFAULT NULL,
    p_voucher_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_finance_id UUID;
    v_adv_deduct DECIMAL(15,2);
    v_net_salary DECIMAL(15,2);
BEGIN
    SELECT user_id, finance_id, advance_deduction, net_salary
    INTO v_user_id, v_finance_id, v_adv_deduct, v_net_salary
    FROM staff_payroll_records WHERE id = p_payroll_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Payroll record not found');
    END IF;

    UPDATE staff_payroll_records SET
        payment_status = 'paid',
        payment_date = CURRENT_DATE,
        payment_mode = p_payment_mode,
        transaction_ref = p_transaction_ref,
        voucher_id = p_voucher_id,
        processed_by = p_disbursed_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_payroll_id;

    IF v_adv_deduct > 0 THEN
        UPDATE staff_salary_advances
        SET remaining_balance = GREATEST(0.00, remaining_balance - v_adv_deduct),
            status = CASE WHEN (remaining_balance - v_adv_deduct) <= 0 THEN 'deducted'::salary_advance_status_enum ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = v_finance_id
          AND user_id = v_user_id
          AND status = 'disbursed'
          AND remaining_balance > 0;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'payroll_id', p_payroll_id,
        'user_id', v_user_id,
        'net_salary_paid', v_net_salary,
        'payment_mode', p_payment_mode,
        'payment_date', CURRENT_DATE
    );
END;
$$;

-- ------------------------------------------------------------
-- View 12.6: Unified Staff Salary Summary View (For Profile.tsx & UserDetailModal.tsx)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW vw_staff_salary_summary AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.phone_no,
    COALESCE(uac.role, 'agent'::user_role_enum) AS user_role,
    u.is_active,
    fd.id AS finance_id,
    fd.finance_name,
    ud.staff_code,
    ud.staff_name,
    COALESCE(sss.base_salary, ud.basic_salary, 0.00) AS basic_salary,
    COALESCE(sss.daily_allowance, ud.daily_allowance, 0.00) AS daily_allowance,
    COALESCE(sss.commission_percent, ud.commission_percent, 0.00) AS commission_percent,
    COALESCE(sss.incentive_per_collection, 0.00) AS incentive_per_collection,
    COALESCE(adv.active_advances_balance, 0.00) AS outstanding_advance_balance,
    last_pay.payroll_month AS last_payroll_month,
    last_pay.net_salary AS last_net_salary,
    last_pay.payment_status AS last_payment_status,
    last_pay.payment_date AS last_payment_date
FROM users u
CROSS JOIN finance_detail fd
LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = fd.id
LEFT JOIN users_details ud ON (ud.user_id = u.id OR ud.id = u.id OR ud.staff_name = u.username) AND ud.finance_id = fd.id
LEFT JOIN staff_salary_structures sss ON sss.user_id = u.id AND sss.finance_id = fd.id AND sss.is_active = true
LEFT JOIN (
    SELECT finance_id, user_id, SUM(remaining_balance) AS active_advances_balance
    FROM staff_salary_advances
    WHERE status = 'disbursed' AND remaining_balance > 0
    GROUP BY finance_id, user_id
) adv ON adv.finance_id = fd.id AND adv.user_id = u.id
LEFT JOIN LATERAL (
    SELECT payroll_month, net_salary, payment_status, payment_date
    FROM staff_payroll_records
    WHERE finance_id = fd.id AND user_id = u.id
    ORDER BY payroll_month DESC LIMIT 1
) last_pay ON true;

-- ============================================================
-- SECTION 4: STORED FUNCTIONS & PROCEDURES (15 Functions)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_link_mob_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_account_id UUID;
  v_has_primary BOOLEAN;
BEGIN
  IF NEW.aadhar_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.finance_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM mob_customers WHERE customer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT mc.customer_account_id INTO v_customer_account_id
  FROM mob_customers mc
  JOIN customers c ON c.id = mc.customer_id
  WHERE c.aadhar_id = NEW.aadhar_id
  LIMIT 1;

  IF v_customer_account_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM mob_customers
      WHERE customer_account_id = v_customer_account_id AND is_primary_link
    ) INTO v_has_primary;

    INSERT INTO mob_customers (customer_account_id, customer_id, finance_id, aadhar_id, is_primary_link)
    VALUES (v_customer_account_id, NEW.id, NEW.finance_id, NEW.aadhar_id, NOT v_has_primary)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_calculate_distance_km(
    lat1 NUMERIC,
    lng1 NUMERIC,
    lat2 NUMERIC,
    lng2 NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    r CONSTANT NUMERIC := 6371.0; -- Earth radius in KM
    dlat NUMERIC;
    dlng NUMERIC;
    a NUMERIC;
    c NUMERIC;
    v_clamped NUMERIC;
BEGIN
    IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
        RETURN 0.00;
    END IF;

    dlat := RADIANS(lat2 - lat1);
    dlng := RADIANS(lng2 - lng1);

    a := (SIN(dlat / 2.0) ^ 2) +
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
         (SIN(dlng / 2.0) ^ 2);

    -- Clamp 'a' between 0.0 and 1.0 to prevent sqrt/asin domain errors
    v_clamped := LEAST(1.0, GREATEST(0.0, a));
    c := 2.0 * ATAN2(SQRT(v_clamped), SQRT(GREATEST(0.0, 1.0 - v_clamped)));

    RETURN ROUND((r * c)::NUMERIC, 2);
END;
$$;

CREATE OR REPLACE FUNCTION fn_get_customer_risk_score(p_customer_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_score INT := 0;
    v_dist NUMERIC := 0.00;
    v_overdue_days INT := 0;
    v_broken_ptp INT := 0;
BEGIN
    -- Distance from home component
    SELECT COALESCE(distance_from_home, 0.00) INTO v_dist
    FROM customer_live_locations WHERE customer_id = p_customer_id;

    -- Overdue loan days component
    SELECT COALESCE(MAX(CURRENT_DATE - l.due_date), 0) INTO v_overdue_days
    FROM loans l
    WHERE l.customer_id = p_customer_id
      AND l.due_date < CURRENT_DATE
      AND COALESCE(l.due_amount, 0) > 0;

    -- Broken PTP promises component
    SELECT COALESCE(SUM(broken_count), 0) INTO v_broken_ptp
    FROM promise_to_pay WHERE customer_id = p_customer_id;

    -- Distance: max 40 pts
    v_score := v_score + LEAST(40, ROUND((v_dist / 50.0) * 40));
    -- Overdue: max 40 pts
    v_score := v_score + LEAST(40, ROUND((v_overdue_days / 90.0) * 40));
    -- Broken PTP: 10 pts per broken promise, max 20 pts
    v_score := v_score + LEAST(20, v_broken_ptp * 10);

    RETURN LEAST(100, GREATEST(0, v_score));
END;
$$;

CREATE OR REPLACE FUNCTION fn_record_customer_live_location(
    p_customer_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_speed NUMERIC DEFAULT NULL,
    p_heading NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_altitude NUMERIC DEFAULT NULL,
    p_battery_level INT DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_device_model VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_home_lat NUMERIC;
    v_home_lng NUMERIC;
    v_dist NUMERIC := 0.00;
    v_is_home BOOLEAN := FALSE;
    v_risk_level VARCHAR(20) := 'safe';
    v_risk_score INT := 0;
BEGIN
    SELECT home_latitude, home_longitude INTO v_home_lat, v_home_lng
    FROM customers WHERE id = p_customer_id;

    IF v_home_lat IS NOT NULL AND v_home_lng IS NOT NULL THEN
        v_dist := fn_calculate_distance_km(v_home_lat, v_home_lng, p_latitude, p_longitude);
        v_is_home := (v_dist <= 0.20);
    END IF;

    IF v_dist > 50.0 THEN
        v_risk_level := 'critical';
    ELSIF v_dist > 25.0 THEN
        v_risk_level := 'high';
    ELSIF v_dist > 10.0 THEN
        v_risk_level := 'warning';
    ELSE
        v_risk_level := 'safe';
    END IF;

    v_risk_score := fn_get_customer_risk_score(p_customer_id);

    INSERT INTO customer_live_locations (
        customer_id, latitude, longitude,
        speed, heading, accuracy, altitude, battery_level,
        is_online, distance_from_home,
        risk_level, risk_score, device_id, device_model,
        last_ping_at, updated_at
    ) VALUES (
        p_customer_id, p_latitude, p_longitude,
        p_speed, p_heading, p_accuracy, p_altitude, p_battery_level,
        true, v_dist,
        v_risk_level, v_risk_score, p_device_id, p_device_model,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (customer_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        accuracy = EXCLUDED.accuracy,
        altitude = EXCLUDED.altitude,
        battery_level = EXCLUDED.battery_level,
        distance_from_home = EXCLUDED.distance_from_home,
        risk_level = EXCLUDED.risk_level,
        risk_score = EXCLUDED.risk_score,
        device_id = COALESCE(EXCLUDED.device_id, customer_live_locations.device_id),
        device_model = COALESCE(EXCLUDED.device_model, customer_live_locations.device_model),
        last_ping_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;

    RETURN jsonb_build_object(
        'status', 'success',
        'customer_id', p_customer_id,
        'distance_from_home_km', v_dist,
        'is_home', v_is_home,
        'risk_level', v_risk_level,
        'risk_score', v_risk_score,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_record_agent_live_location(
    p_user_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_speed NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_device_id VARCHAR DEFAULT NULL,
    p_device_model VARCHAR DEFAULT NULL,
    p_battery_level INT DEFAULT NULL,
    p_is_online BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO agent_locations (
        user_id, latitude, longitude, speed, accuracy,
        device_id, device_model, battery_level, is_online, last_updated_at
    ) VALUES (
        p_user_id, p_latitude, p_longitude, p_speed, p_accuracy,
        p_device_id, p_device_model, p_battery_level, p_is_online, CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        accuracy = EXCLUDED.accuracy,
        device_id = COALESCE(EXCLUDED.device_id, agent_locations.device_id),
        device_model = COALESCE(EXCLUDED.device_model, agent_locations.device_model),
        battery_level = EXCLUDED.battery_level,
        is_online = EXCLUDED.is_online,
        last_updated_at = CURRENT_TIMESTAMP;

    RETURN jsonb_build_object(
        'status', 'success',
        'user_id', p_user_id,
        'is_online', p_is_online,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_assign_customer_to_agent(
    p_finance_id UUID,
    p_customer_id UUID,
    p_agent_id UUID,
    p_assigned_by UUID DEFAULT NULL,
    p_priority assignment_priority_enum DEFAULT 'medium',
    p_notes TEXT DEFAULT NULL,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan_id UUID := p_loan_id;
    v_due_amount DECIMAL(15,2) := 0.00;
    v_new_id UUID;
BEGIN
    IF v_loan_id IS NULL THEN
        SELECT id, COALESCE(due_amount, 0.00)
        INTO v_loan_id, v_due_amount
        FROM loans
        WHERE customer_id = p_customer_id
        ORDER BY id DESC LIMIT 1;
    ELSE
        SELECT COALESCE(due_amount, 0.00)
        INTO v_due_amount
        FROM loans WHERE id = v_loan_id;
    END IF;

    UPDATE customer_agent_assignments
    SET status = 'reassigned',
        unassigned_at = CURRENT_TIMESTAMP
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'visited');

    INSERT INTO customer_agent_assignments (
        finance_id, customer_id, agent_id, assigned_by,
        priority, status, due_amount, notes, assigned_at
    ) VALUES (
        p_finance_id, p_customer_id, p_agent_id, p_assigned_by,
        p_priority, 'pending', COALESCE(v_due_amount, 0.00), p_notes, CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'assignment_id', v_new_id,
        'customer_id', p_customer_id,
        'agent_id', p_agent_id,
        'due_amount', COALESCE(v_due_amount, 0.00),
        'priority', p_priority,
        'assigned_at', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_assign_bulk_customers_to_agent(
    p_finance_id UUID,
    p_customer_ids UUID[],
    p_agent_id UUID,
    p_assigned_by UUID DEFAULT NULL,
    p_priority assignment_priority_enum DEFAULT 'medium',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cust_id UUID;
    v_count INT := 0;
    v_assigned_ids UUID[] := '{}';
BEGIN
    FOREACH v_cust_id IN ARRAY p_customer_ids
    LOOP
        PERFORM fn_assign_customer_to_agent(
            p_finance_id, v_cust_id, p_agent_id, p_assigned_by, p_priority, p_notes
        );
        v_count := v_count + 1;
        v_assigned_ids := array_append(v_assigned_ids, v_cust_id);
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'assigned_count', v_count,
        'customer_ids', v_assigned_ids,
        'agent_id', p_agent_id,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_unassign_customer(
    p_customer_id UUID,
    p_unassigned_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    UPDATE customer_agent_assignments
    SET status = 'failed',
        unassigned_at = CURRENT_TIMESTAMP,
        notes = CASE 
            WHEN p_reason IS NOT NULL THEN COALESCE(notes || ' | ', '') || 'Unassigned: ' || p_reason
            ELSE notes 
        END
    WHERE customer_id = p_customer_id
      AND status IN ('pending', 'visited');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'success',
        'unassigned_count', v_updated_count,
        'customer_id', p_customer_id,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_record_telecall_outcome(
    p_lead_id UUID,
    p_call_status lead_call_status_enum,
    p_duration_seconds INT DEFAULT 0,
    p_outcome_note TEXT DEFAULT NULL,
    p_transcript JSONB DEFAULT '[]'::jsonb,
    p_disposition VARCHAR DEFAULT NULL,
    p_scheduled_time TIMESTAMP DEFAULT NULL,
    p_schedule_preset VARCHAR DEFAULT NULL,
    p_promised_amount DECIMAL(15,2) DEFAULT NULL,
    p_promised_date DATE DEFAULT NULL,
    p_called_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead RECORD;
    v_log_id UUID;
    v_ptp_id UUID := NULL;
    v_duration_str VARCHAR(30);
BEGIN
    SELECT * INTO v_lead FROM ai_telecalling_leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Lead not found');
    END IF;

    IF p_duration_seconds > 0 THEN
        v_duration_str := (p_duration_seconds / 60)::text || 'm ' || (p_duration_seconds % 60)::text || 's';
    ELSE
        v_duration_str := NULL;
    END IF;

    -- If customer promised to pay during the call, automatically create PTP
    IF p_promised_amount IS NOT NULL AND p_promised_amount > 0 AND p_promised_date IS NOT NULL THEN
        INSERT INTO promise_to_pay (
            finance_id, customer_id, user_id, promised_amount, promised_date,
            ptp_status, reason, note, created_at, updated_at
        ) VALUES (
            v_lead.finance_id, v_lead.customer_id, p_called_by_user_id,
            p_promised_amount, p_promised_date, 'pending', 'Promised via AI Telecall',
            p_outcome_note, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id INTO v_ptp_id;
    END IF;

    -- Update the lead in active calling queue
    UPDATE ai_telecalling_leads SET
        call_status = p_call_status,
        last_call_at = CURRENT_TIMESTAMP,
        last_call_duration = v_duration_str,
        duration_seconds = p_duration_seconds,
        call_outcome_note = COALESCE(p_outcome_note, call_outcome_note),
        scheduled_time = COALESCE(p_scheduled_time, scheduled_time),
        schedule_preset = COALESCE(p_schedule_preset, schedule_preset),
        ptp_id = COALESCE(v_ptp_id, ptp_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lead_id;

    -- Log the individual call execution attempt
    INSERT INTO ai_telecalling_call_logs (
        lead_id, finance_id, customer_id, call_status,
        call_duration_seconds, started_at, ended_at, transcript,
        call_outcome_note, disposition, caller_type, called_by_user_id, created_at
    ) VALUES (
        p_lead_id, v_lead.finance_id, v_lead.customer_id, p_call_status,
        p_duration_seconds, CURRENT_TIMESTAMP - (p_duration_seconds || ' seconds')::INTERVAL, CURRENT_TIMESTAMP,
        p_transcript, p_outcome_note, p_disposition,
        CASE WHEN p_called_by_user_id IS NOT NULL THEN 'agent' ELSE 'ai_bot' END,
        p_called_by_user_id, CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_log_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'lead_id', p_lead_id,
        'call_log_id', v_log_id,
        'ptp_id', v_ptp_id,
        'call_status', p_call_status,
        'duration', v_duration_str,
        'timestamp', CURRENT_TIMESTAMP
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_calculate_staff_monthly_payroll(
    p_finance_id UUID,
    p_user_id UUID,
    p_month VARCHAR(7), -- e.g. '2026-04'
    p_working_days INT DEFAULT 30,
    p_present_days INT DEFAULT 30,
    p_bonus DECIMAL(15,2) DEFAULT 0.00,
    p_processed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_base_salary DECIMAL(15,2) := 0.00;
    v_daily_allowance DECIMAL(10,2) := 0.00;
    v_comm_percent DECIMAL(5,2) := 0.00;
    v_incentive_per_col DECIMAL(10,2) := 0.00;
    v_pf DECIMAL(10,2) := 0.00;
    v_esi DECIMAL(10,2) := 0.00;

    v_total_col_count INT := 0;
    v_total_col_amount DECIMAL(15,2) := 0.00;
    v_commission_earned DECIMAL(15,2) := 0.00;
    v_allowance_amount DECIMAL(15,2) := 0.00;
    v_gross_salary DECIMAL(15,2) := 0.00;
    v_advance_deduction DECIMAL(15,2) := 0.00;
    v_variance_deduction DECIMAL(15,2) := 0.00;
    v_net_salary DECIMAL(15,2) := 0.00;
    v_payroll_id UUID;

    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_start_date := TO_DATE(p_month || '-01', 'YYYY-MM-DD');
    v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT base_salary, daily_allowance, commission_percent, incentive_per_collection, pf_deduction, esi_deduction
    INTO v_base_salary, v_daily_allowance, v_comm_percent, v_incentive_per_col, v_pf, v_esi
    FROM staff_salary_structures
    WHERE finance_id = p_finance_id AND user_id = p_user_id AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT COALESCE(basic_salary, 0.00), COALESCE(daily_allowance, 0.00), COALESCE(commission_percent, 0.00)
        INTO v_base_salary, v_daily_allowance, v_comm_percent
        FROM users_details
        WHERE finance_id = p_finance_id AND (id = p_user_id OR staff_name = (SELECT username FROM users WHERE id = p_user_id))
        LIMIT 1;
    END IF;

    -- Aggregate payments collected by this user during the month
    SELECT 
        COALESCE(COUNT(id), 0),
        COALESCE(SUM(amount), 0.00)
    INTO v_total_col_count, v_total_col_amount
    FROM payments
    WHERE collected_by_id = p_user_id
      AND payment_date >= v_start_date
      AND payment_date <= v_end_date;

    v_commission_earned := ROUND((v_total_col_amount * (v_comm_percent / 100.00)) + (v_total_col_count * v_incentive_per_col), 2);
    v_allowance_amount := ROUND(v_daily_allowance * p_present_days, 2);

    IF p_working_days > 0 THEN
        v_gross_salary := ROUND((v_base_salary / p_working_days) * p_present_days + v_commission_earned + v_allowance_amount + COALESCE(p_bonus, 0.00), 2);
    ELSE
        v_gross_salary := v_base_salary + v_commission_earned + v_allowance_amount + COALESCE(p_bonus, 0.00);
    END IF;

    -- Check outstanding salary advances for scheduled deduction
    SELECT COALESCE(SUM(LEAST(monthly_deduction_amount, remaining_balance)), 0.00)
    INTO v_advance_deduction
    FROM staff_salary_advances
    WHERE finance_id = p_finance_id
      AND user_id = p_user_id
      AND status = 'disbursed'
      AND remaining_balance > 0;

    -- Check cash variances
    SELECT COALESCE(SUM(GREATEST(0, variance_amount)), 0.00)
    INTO v_variance_deduction
    FROM cash_variance_records
    WHERE finance_id = p_finance_id
      AND agent_id = p_user_id
      AND reconciliation_date >= v_start_date
      AND reconciliation_date <= v_end_date
      AND status = 'variance';

    v_net_salary := GREATEST(0.00, v_gross_salary - (v_advance_deduction + v_variance_deduction + COALESCE(v_pf, 0.00) + COALESCE(v_esi, 0.00)));

    INSERT INTO staff_payroll_records (
        finance_id, user_id, payroll_month, base_salary,
        total_working_days, present_days, total_collections_count, total_collection_amount,
        commission_earned, allowance_amount, bonus_amount, gross_salary,
        advance_deduction, variance_deduction, pf_deduction, esi_deduction,
        net_salary, payment_status, processed_by, updated_at
    ) VALUES (
        p_finance_id, p_user_id, p_month, v_base_salary,
        p_working_days, p_present_days, v_total_col_count, v_total_col_amount,
        v_commission_earned, v_allowance_amount, COALESCE(p_bonus, 0.00), v_gross_salary,
        v_advance_deduction, v_variance_deduction, COALESCE(v_pf, 0.00), COALESCE(v_esi, 0.00),
        v_net_salary, 'draft', p_processed_by, CURRENT_TIMESTAMP
    )
    ON CONFLICT (finance_id, user_id, payroll_month) DO UPDATE SET
        base_salary = EXCLUDED.base_salary,
        total_working_days = EXCLUDED.total_working_days,
        present_days = EXCLUDED.present_days,
        total_collections_count = EXCLUDED.total_collections_count,
        total_collection_amount = EXCLUDED.total_collection_amount,
        commission_earned = EXCLUDED.commission_earned,
        allowance_amount = EXCLUDED.allowance_amount,
        bonus_amount = EXCLUDED.bonus_amount,
        gross_salary = EXCLUDED.gross_salary,
        advance_deduction = EXCLUDED.advance_deduction,
        variance_deduction = EXCLUDED.variance_deduction,
        pf_deduction = EXCLUDED.pf_deduction,
        esi_deduction = EXCLUDED.esi_deduction,
        net_salary = EXCLUDED.net_salary,
        processed_by = EXCLUDED.processed_by,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_payroll_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'payroll_id', v_payroll_id,
        'user_id', p_user_id,
        'month', p_month,
        'base_salary', v_base_salary,
        'collections_count', v_total_col_count,
        'collections_amount', v_total_col_amount,
        'commission_earned', v_commission_earned,
        'allowance_amount', v_allowance_amount,
        'gross_salary', v_gross_salary,
        'advance_deduction', v_advance_deduction,
        'variance_deduction', v_variance_deduction,
        'net_salary', v_net_salary
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_disburse_staff_salary(
    p_payroll_id UUID,
    p_disbursed_by UUID,
    p_payment_mode pay_mode_enum DEFAULT 'bank',
    p_transaction_ref VARCHAR(150) DEFAULT NULL,
    p_voucher_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_finance_id UUID;
    v_adv_deduct DECIMAL(15,2);
    v_net_salary DECIMAL(15,2);
BEGIN
    SELECT user_id, finance_id, advance_deduction, net_salary
    INTO v_user_id, v_finance_id, v_adv_deduct, v_net_salary
    FROM staff_payroll_records WHERE id = p_payroll_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Payroll record not found');
    END IF;

    UPDATE staff_payroll_records SET
        payment_status = 'paid',
        payment_date = CURRENT_DATE,
        payment_mode = p_payment_mode,
        transaction_ref = p_transaction_ref,
        voucher_id = p_voucher_id,
        processed_by = p_disbursed_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_payroll_id;

    IF v_adv_deduct > 0 THEN
        UPDATE staff_salary_advances
        SET remaining_balance = GREATEST(0.00, remaining_balance - v_adv_deduct),
            status = CASE WHEN (remaining_balance - v_adv_deduct) <= 0 THEN 'deducted'::salary_advance_status_enum ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE finance_id = v_finance_id
          AND user_id = v_user_id
          AND status = 'disbursed'
          AND remaining_balance > 0;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'payroll_id', p_payroll_id,
        'user_id', v_user_id,
        'net_salary_paid', v_net_salary,
        'payment_mode', p_payment_mode,
        'payment_date', CURRENT_DATE
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_log_assignment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO assignment_history (
            assignment_id, finance_id, user_id, customer_id,
            status, notes, due_amount, changed_by, changed_at
        ) VALUES (
            NEW.id, NEW.finance_id, NEW.agent_id, NEW.customer_id,
            NEW.status, NEW.notes, NEW.due_amount, NEW.assigned_by, CURRENT_TIMESTAMP
        );
    ELSIF (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.agent_id IS DISTINCT FROM NEW.agent_id)) THEN
        INSERT INTO assignment_history (
            assignment_id, finance_id, user_id, customer_id,
            status, notes, due_amount, changed_by, changed_at
        ) VALUES (
            NEW.id, NEW.finance_id, NEW.agent_id, NEW.customer_id,
            NEW.status, NEW.notes, NEW.due_amount, NEW.assigned_by, CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_enforce_single_primary_bank()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_primary = true THEN
        UPDATE finance_bank_accounts
        SET is_primary = false
        WHERE finance_id = NEW.finance_id AND id <> NEW.id AND is_primary = true;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_log_loan_app_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO loan_application_stage_history (
            loan_application_id, from_status, to_status, changed_by, remarks, transitioned_at
        ) VALUES (
            NEW.id, OLD.status, NEW.status, NEW.assigned_to_user_id, NEW.rejection_reason, CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_trg_track_ptp_broken()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (NEW.ptp_status = 'broken' AND OLD.ptp_status <> 'broken') THEN
        NEW.broken_count := OLD.broken_count + 1;
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- ============================================================
-- SECTION 5: DATABASE TRIGGERS (5 Triggers)
-- ============================================================

-- Trigger 5.1: Automatically Link Mobile Customer on Customer Insert/Update
DROP TRIGGER IF EXISTS trg_customers_auto_link ON customers;
CREATE TRIGGER trg_customers_auto_link
AFTER INSERT OR UPDATE OF aadhar_id ON customers
FOR EACH ROW
EXECUTE FUNCTION fn_auto_link_mob_customer();

-- Trigger 5.2: Automatically Log Assignment History
DROP TRIGGER IF EXISTS trg_assignment_history_log ON customer_agent_assignments;
CREATE TRIGGER trg_assignment_history_log
AFTER INSERT OR UPDATE ON customer_agent_assignments
FOR EACH ROW
EXECUTE FUNCTION fn_trg_log_assignment_history();

-- Trigger 5.3: Enforce Single Primary Company Bank Account
DROP TRIGGER IF EXISTS trg_enforce_single_primary_bank ON finance_bank_accounts;
CREATE TRIGGER trg_enforce_single_primary_bank
BEFORE INSERT OR UPDATE OF is_primary ON finance_bank_accounts
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION fn_trg_enforce_single_primary_bank();

-- Trigger 5.4: Automatically Track Loan Application Stage History
DROP TRIGGER IF EXISTS trg_loan_app_stage_log ON loan_applications;
CREATE TRIGGER trg_loan_app_stage_log
AFTER UPDATE OF status ON loan_applications
FOR EACH ROW
EXECUTE FUNCTION fn_trg_log_loan_app_stage();

-- Trigger 5.5: Increment Broken PTP Count
DROP TRIGGER IF EXISTS trg_track_ptp_broken ON promise_to_pay;
CREATE TRIGGER trg_track_ptp_broken
BEFORE UPDATE OF ptp_status ON promise_to_pay
FOR EACH ROW
EXECUTE FUNCTION fn_trg_track_ptp_broken();

-- ============================================================
-- SECTION 6: REPORTING & OPERATIONAL VIEWS (5 Views)
-- ============================================================

CREATE OR REPLACE VIEW vw_customer_live_tracking AS
SELECT 
    c.id AS customer_id,
    c.finance_id,
    f.finance_name,
    c.cname AS customer_name,
    c.hplno,
    vd.vehicle_number,
    c.home_latitude,
    c.home_longitude,
    c.home_address,
    cll.latitude AS current_latitude,
    cll.longitude AS current_longitude,
    COALESCE(cll.distance_from_home, 0.00) AS distance_from_home,
    COALESCE(cll.risk_level, 'safe') AS risk_level,
    COALESCE(cll.risk_score, 0) AS risk_score,
    COALESCE(cll.speed, 0.00) AS speed,
    cll.battery_level,
    cll.device_id,
    cll.device_model,
    cll.last_ping_at,
    caa.agent_id AS assigned_agent_id,
    u.username AS assigned_agent_name,
    caa.status AS assignment_status,
    COALESCE(l.hp_amount, 0.00) AS loan_amount,
    COALESCE(l.due_amount, 0.00) AS overdue_amount
FROM customers c
LEFT JOIN finance_detail f ON f.id = c.finance_id
LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
LEFT JOIN customer_live_locations cll ON cll.customer_id = c.id
LEFT JOIN customer_agent_assignments caa ON caa.customer_id = c.id AND caa.status IN ('pending', 'visited')
LEFT JOIN users u ON u.id = caa.agent_id
LEFT JOIN LATERAL (
    SELECT id, hp_amount, due_amount
    FROM loans
    WHERE customer_id = c.id
    ORDER BY id DESC
    LIMIT 1
) l ON true;

CREATE OR REPLACE VIEW vw_ai_lead_calling_list AS
SELECT 
    atl.id AS lead_id,
    atl.finance_id,
    f.finance_name,
    atl.customer_id,
    c.cname AS customer_name,
    c.cname AS customer_full_name,
    c.hplno AS hpl_number,
    COALESCE(
        (SELECT ct.number FROM contacts ct WHERE ct.customer_id = c.id ORDER BY ct.id ASC LIMIT 1),
        'N/A'
    ) AS phone,
    COALESCE(
        vi.brand || ' ' || vi.model_name,
        vd.vehicle_modal,
        'Vehicle'
    ) AS vehicle_model,
    vd.vehicle_number AS vehicle_plate,
    COALESCE(l.due_amount, 0.00) AS due_amount,
    l.due_date AS due_date,
    atl.days_overdue,
    atl.call_status,
    atl.last_call_at,
    atl.last_call_duration,
    atl.call_outcome_note,
    atl.scheduled_time,
    atl.schedule_preset,
    atl.ptp_id,
    u.username AS assigned_agent_name
FROM ai_telecalling_leads atl
JOIN finance_detail f ON f.id = atl.finance_id
JOIN customers c ON c.id = atl.customer_id
LEFT JOIN vehicle_detail vd ON vd.id = c.vehicle_id
LEFT JOIN vehicle_info vi ON vi.id = vd.vehicle_info_id
LEFT JOIN LATERAL (
    SELECT id, due_amount, due_date
    FROM loans
    WHERE customer_id = c.id
    ORDER BY id DESC
    LIMIT 1
) l ON true
LEFT JOIN users u ON u.id = atl.assigned_agent_id;

CREATE OR REPLACE FUNCTION get_next_hplno(
    p_finance_id UUID
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
    SELECT n
    FROM generate_series(
        1,
        (
            SELECT COALESCE(MAX(hplno), 0) + 1
            FROM customers
            WHERE finance_id = p_finance_id
        )
    ) AS n
    WHERE NOT EXISTS (
        SELECT 1
        FROM customers c
        WHERE c.finance_id = p_finance_id
          AND c.hplno = n
    )
    ORDER BY n
    LIMIT 1;
$$;

CREATE OR REPLACE VIEW vw_staff_salary_summary AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.phone_no,
    COALESCE(uac.role, 'agent'::user_role_enum) AS user_role,
    u.is_active,
    fd.id AS finance_id,
    fd.finance_name,
    ud.staff_code,
    ud.staff_name,
    COALESCE(sss.base_salary, ud.basic_salary, 0.00) AS basic_salary,
    COALESCE(sss.daily_allowance, ud.daily_allowance, 0.00) AS daily_allowance,
    COALESCE(sss.commission_percent, ud.commission_percent, 0.00) AS commission_percent,
    COALESCE(sss.incentive_per_collection, 0.00) AS incentive_per_collection,
    COALESCE(adv.active_advances_balance, 0.00) AS outstanding_advance_balance,
    last_pay.payroll_month AS last_payroll_month,
    last_pay.net_salary AS last_net_salary,
    last_pay.payment_status AS last_payment_status,
    last_pay.payment_date AS last_payment_date
FROM users u
CROSS JOIN finance_detail fd
LEFT JOIN user_allowed_companies uac ON uac.user_id = u.id AND uac.finance_id = fd.id
LEFT JOIN users_details ud ON (ud.user_id = u.id OR ud.id = u.id OR ud.staff_name = u.username) AND ud.finance_id = fd.id
LEFT JOIN staff_salary_structures sss ON sss.user_id = u.id AND sss.finance_id = fd.id AND sss.is_active = true
LEFT JOIN (
    SELECT finance_id, user_id, SUM(remaining_balance) AS active_advances_balance
    FROM staff_salary_advances
    WHERE status = 'disbursed' AND remaining_balance > 0
    GROUP BY finance_id, user_id
) adv ON adv.finance_id = fd.id AND adv.user_id = u.id
LEFT JOIN LATERAL (
    SELECT payroll_month, net_salary, payment_status, payment_date
    FROM staff_payroll_records
    WHERE finance_id = fd.id AND user_id = u.id
    ORDER BY payroll_month DESC LIMIT 1
) last_pay ON true;

-- View 6.4: Backward Compatibility View for Customers (Reconstructs normalized photos, phone, telemetry)
CREATE OR REPLACE VIEW v_customers_extended AS
SELECT
    c.*,
    (
        SELECT kd.file_path FROM kyc_documents kd 
        WHERE kd.entity_type = 'customer' 
          AND kd.entity_id = c.id::VARCHAR(50) 
          AND kd.document_type = 'customer_photo' 
          AND kd.is_current = true 
        ORDER BY kd.created_at DESC 
        LIMIT 1
    ) AS cphoto,
    (
        SELECT kd.file_path FROM kyc_documents kd 
        WHERE kd.entity_type = 'customer' 
          AND kd.entity_id = c.id::VARCHAR(50) 
          AND kd.document_type = 'property_photo' 
          AND kd.is_current = true 
        ORDER BY kd.created_at DESC 
        LIMIT 1
    ) AS cproperty_photo,
    (
        SELECT kd.file_path FROM kyc_documents kd 
        WHERE kd.entity_type = 'customer' 
          AND kd.entity_id = c.id::VARCHAR(50) 
          AND kd.document_type = 'vehicle_photo' 
          AND kd.is_current = true 
        ORDER BY kd.created_at DESC 
        LIMIT 1
    ) AS cvehicle_photo,
    (
        SELECT ct.number FROM contacts ct 
        WHERE ct.customer_id = c.id 
          AND ct.contact_type = 'customer' 
          AND ct.type = 'work' 
        LIMIT 1
    ) AS work_office_phone,
    cll.latitude AS current_latitude,
    cll.longitude AS current_longitude,
    COALESCE(cll.distance_from_home, 0.00) AS distance_from_home,
    cll.last_ping_at AS last_seen_home
FROM customers c
LEFT JOIN customer_live_locations cll ON cll.customer_id = c.id;

-- View 6.5: Backward Compatibility View for Guardians (Reconstructs normalized photos and phone)
CREATE OR REPLACE VIEW v_guardians_extended AS
SELECT
    g.*,
    (
        SELECT kd.file_path FROM kyc_documents kd 
        WHERE kd.entity_type = 'guardian' 
          AND kd.entity_id = g.id::VARCHAR(50) 
          AND kd.document_type = 'guardian_photo' 
          AND kd.is_current = true 
        ORDER BY kd.created_at DESC 
        LIMIT 1
    ) AS gphoto,
    (
        SELECT kd.file_path FROM kyc_documents kd 
        WHERE kd.entity_type = 'guardian' 
          AND kd.entity_id = g.id::VARCHAR(50) 
          AND kd.document_type = 'property_photo' 
          AND kd.is_current = true 
        ORDER BY kd.created_at DESC 
        LIMIT 1
    ) AS gproperty_photo,
    (
        SELECT ct.number FROM contacts ct 
        WHERE ct.customer_id = g.customer_id 
          AND ct.contact_type = 'guardian' 
          AND ct.type = 'work' 
        LIMIT 1
    ) AS work_office_phone
FROM guardians g;

-- ============================================================
-- SECTION 7: EXTENSION PERFORMANCE & QUERY INDEXES
-- ============================================================

-- Location & Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_cll_customer ON customer_live_locations (customer_id);
CREATE INDEX IF NOT EXISTS idx_cll_online_risk ON customer_live_locations (is_online, risk_level);
CREATE INDEX IF NOT EXISTS idx_cll_last_ping ON customer_live_locations (last_ping_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_user_online ON agent_locations (user_id, is_online);
CREATE INDEX IF NOT EXISTS idx_scv_user_date ON staff_customer_visits (user_id, visit_time DESC);
CREATE INDEX IF NOT EXISTS idx_scv_cust_date ON staff_customer_visits (customer_id, visit_time DESC);
CREATE INDEX IF NOT EXISTS idx_als_user_date ON agent_login_sessions (user_id, login_time DESC);

-- Agent Assignment Indexes
CREATE INDEX IF NOT EXISTS idx_caa_agent_status ON customer_agent_assignments (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_caa_customer_status ON customer_agent_assignments (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_ah_assignment_date ON assignment_history (assignment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_aaa_user ON agent_area_allocations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token ON agent_invitations (invite_token);
CREATE INDEX IF NOT EXISTS idx_ai_invitation_code ON agent_invitations (invitation_code);

-- Collections & PTP Indexes
CREATE INDEX IF NOT EXISTS idx_cvr_agent_date ON cash_variance_records (agent_id, reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_ptp_user_date ON promise_to_pay (user_id, promised_date, ptp_status);
CREATE INDEX IF NOT EXISTS idx_ptp_cust_date ON promise_to_pay (customer_id, promised_date);
CREATE INDEX IF NOT EXISTS idx_pfu_ptp ON ptp_follow_ups (ptp_id, created_at DESC);

-- AI Module Indexes
CREATE INDEX IF NOT EXISTS idx_aic_finance_sentiment ON ai_conversations (finance_id, sentiment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aic_customer ON ai_conversations (customer_id);
CREATE INDEX IF NOT EXISTS idx_aic_account ON ai_conversations (customer_account_id);
CREATE INDEX IF NOT EXISTS idx_aim_conv_created ON ai_messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_acm_cust_category ON ai_customer_memory (customer_id, memory_category);
CREATE INDEX IF NOT EXISTS idx_acm_account_category ON ai_customer_memory (customer_account_id, memory_category);
CREATE INDEX IF NOT EXISTS idx_atl_finance_status ON ai_telecalling_leads (finance_id, call_status);
CREATE INDEX IF NOT EXISTS idx_atl_customer ON ai_telecalling_leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_atl_scheduled ON ai_telecalling_leads (scheduled_time);
CREATE INDEX IF NOT EXISTS idx_atcl_lead_date ON ai_telecalling_call_logs (lead_id, created_at DESC);


-- Plans & QR Indexes
CREATE INDEX IF NOT EXISTS idx_rsp_finance_active ON rsp_bank_master (finance_id, is_active);
CREATE INDEX IF NOT EXISTS idx_qls_token ON qr_login_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_qpr_ref ON qr_payment_requests (qr_ref);
CREATE INDEX IF NOT EXISTS idx_adel_mandate_date ON auto_debit_execution_logs (mandate_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_adel_utr ON auto_debit_execution_logs (utr_number);
CREATE INDEX IF NOT EXISTS idx_lash_app_date ON loan_application_stage_history (loan_application_id, transitioned_at DESC);

-- Salary & Payroll Indexes
CREATE INDEX IF NOT EXISTS idx_sss_user_finance ON staff_salary_structures (user_id, finance_id);
CREATE INDEX IF NOT EXISTS idx_ssa_user_status ON staff_salary_advances (user_id, status);
CREATE INDEX IF NOT EXISTS idx_spr_user_month ON staff_payroll_records (user_id, payroll_month);
CREATE INDEX IF NOT EXISTS idx_spr_status ON staff_payroll_records (payment_status);

-- ============================================================
-- [PART C: 8 SUBSCRIPTION, REFERRAL & DYNAMIC FEATURE TABLES]
-- ============================================================

-- ============================================================
-- TABLE 73: system_features
-- Purpose : Master registry of ALL dynamic system features and modular add-ons.
--           To introduce a new feature simply INSERT a row here. ZERO table alterations required!
-- ============================================================
CREATE TABLE IF NOT EXISTS system_features (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    code                      VARCHAR(50)         NOT NULL,
    name                      VARCHAR(100)        NOT NULL,
    description               TEXT                DEFAULT NULL,
    category                  VARCHAR(50)         NOT NULL DEFAULT 'feature',
    is_standalone_addon       BOOLEAN             NOT NULL DEFAULT true,
    default_addon_price       DECIMAL(10,2)       DEFAULT 0.00 CHECK (default_addon_price >= 0),
    is_active                 BOOLEAN             NOT NULL DEFAULT true,
    display_order             SMALLINT            NOT NULL DEFAULT 0,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_sf_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_sf_code ON system_features (code);
CREATE INDEX IF NOT EXISTS idx_sf_active ON system_features (is_active);
CREATE INDEX IF NOT EXISTS idx_sf_category ON system_features (category);


-- ============================================================
-- TABLE 74: subscription_plans
-- Purpose : Plan pricing tiers (A1..A4) & capacity limits (versioned).
--           Features are NOT hardcoded here â€” mapped dynamically via plan_features.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    plan_code                 VARCHAR(50)         NOT NULL,
    plan_name                 VARCHAR(100)        NOT NULL,
    description               TEXT                DEFAULT NULL,
    version                   INT                 NOT NULL DEFAULT 1,
    price_monthly             DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (price_monthly >= 0),
    price_yearly              DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (price_yearly >= 0),
    currency                  VARCHAR(5)          NOT NULL DEFAULT 'INR',
    max_customers             INT                 DEFAULT NULL,
    max_finances              INT                 DEFAULT 1,
    max_users                 INT                 DEFAULT NULL,
    display_order             SMALLINT            NOT NULL DEFAULT 0,
    is_popular                BOOLEAN             NOT NULL DEFAULT false,
    is_active                 BOOLEAN             NOT NULL DEFAULT true,
    trial_days                INT                 NOT NULL DEFAULT 30,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_plan_code_version UNIQUE (plan_code, version)
);

CREATE INDEX IF NOT EXISTS idx_sp_plan_code ON subscription_plans (plan_code);
CREATE INDEX IF NOT EXISTS idx_sp_is_active ON subscription_plans (is_active);
CREATE INDEX IF NOT EXISTS idx_sp_display_order ON subscription_plans (display_order);


-- ============================================================
-- TABLE 75: plan_features
-- Purpose : Junction mapping features included per plan.
--           Adding/removing a feature from a plan is just an INSERT or DELETE.
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_features (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    plan_id                   UUID                NOT NULL,
    feature_code              VARCHAR(50)         NOT NULL,
    is_included               BOOLEAN             NOT NULL DEFAULT true,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_pf_plan_feature UNIQUE (plan_id, feature_code),
    CONSTRAINT fk_pf_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_pf_feature FOREIGN KEY (feature_code) REFERENCES system_features(code) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pf_plan_id ON plan_features (plan_id);
CREATE INDEX IF NOT EXISTS idx_pf_feature_code ON plan_features (feature_code);


-- ============================================================
-- TABLE 76: owner_subscriptions
-- Purpose : Base plan purchase history with immutable frozen plan_snapshot JSONB.
--           plan_snapshot stores the EXACT plan config at time of purchase.
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_subscriptions (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                NOT NULL,
    plan_id                   UUID                NOT NULL,
    plan_snapshot             JSONB               NOT NULL,
    status                    subscription_status_enum NOT NULL DEFAULT 'active',
    billing_cycle             billing_cycle_enum  NOT NULL DEFAULT 'monthly',
    starts_at                 TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at                TIMESTAMP           NOT NULL,
    cancelled_at              TIMESTAMP           DEFAULT NULL,
    is_trial                  BOOLEAN             NOT NULL DEFAULT false,
    paid_amount               DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    discount_amount           DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    discount_reason           VARCHAR(255)        DEFAULT NULL,
    currency                  VARCHAR(5)          NOT NULL DEFAULT 'INR',
    payment_id                VARCHAR(255)        DEFAULT NULL,
    payment_gateway           VARCHAR(50)         DEFAULT NULL,
    invoice_number            VARCHAR(100)        DEFAULT NULL,
    referral_id               UUID                DEFAULT NULL,
    activated_by              VARCHAR(100)        DEFAULT NULL,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_osub_owner FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
    CONSTRAINT fk_osub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_osub_owner_id ON owner_subscriptions (owner_id);
CREATE INDEX IF NOT EXISTS idx_osub_owner_status ON owner_subscriptions (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_osub_plan_id ON owner_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_osub_status ON owner_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_osub_expires_at ON owner_subscriptions (expires_at);
CREATE INDEX IF NOT EXISTS idx_osub_payment_id ON owner_subscriptions (payment_id);
CREATE INDEX IF NOT EXISTS idx_osub_is_trial ON owner_subscriptions (is_trial) WHERE is_trial = true;
CREATE INDEX IF NOT EXISTS idx_osub_referral_id ON owner_subscriptions (referral_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_osub_one_active_per_owner
    ON owner_subscriptions (owner_id)
    WHERE status IN ('active', 'trial');


-- ============================================================
-- TABLE 77: owner_features
-- Purpose : RUNTIME SOURCE OF TRUTH for an owner's feature permissions.
--           No rigid boolean columns! Each active feature is a dynamic row.
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_features (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                NOT NULL,
    feature_code              VARCHAR(50)         NOT NULL,
    is_enabled                BOOLEAN             NOT NULL DEFAULT true,
    source                    VARCHAR(30)         NOT NULL DEFAULT 'plan',
    starts_at                 TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at                TIMESTAMP           DEFAULT NULL,
    granted_by                VARCHAR(100)        DEFAULT NULL,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_of_owner_feature UNIQUE (owner_id, feature_code),
    CONSTRAINT fk_of_owner FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
    CONSTRAINT fk_of_feature FOREIGN KEY (feature_code) REFERENCES system_features(code) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_of_owner_id ON owner_features (owner_id);
CREATE INDEX IF NOT EXISTS idx_of_feature_code ON owner_features (feature_code);
CREATE INDEX IF NOT EXISTS idx_of_active ON owner_features (owner_id, feature_code, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_of_expires_at ON owner_features (expires_at) WHERE expires_at IS NOT NULL;


-- ============================================================
-- TABLE 78: owner_referrals
-- Purpose : Owner-to-owner B2B SaaS referral tracking & reward discounts.
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_referrals (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    referrer_owner_id         UUID                NOT NULL,
    referred_owner_id         UUID                DEFAULT NULL,
    referral_code             VARCHAR(30)         NOT NULL,
    referrer_discount_pct     DECIMAL(5,2)        NOT NULL DEFAULT 10.00 CHECK (referrer_discount_pct >= 0 AND referrer_discount_pct <= 100),
    referred_discount_pct     DECIMAL(5,2)        NOT NULL DEFAULT 10.00 CHECK (referred_discount_pct >= 0 AND referred_discount_pct <= 100),
    referrer_bonus_amount     DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (referrer_bonus_amount >= 0),
    referred_bonus_amount     DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (referred_bonus_amount >= 0),
    status                    owner_referral_status_enum NOT NULL DEFAULT 'pending',
    applied_at                TIMESTAMP           DEFAULT NULL,
    expires_at                TIMESTAMP           DEFAULT NULL,
    applied_subscription_id   UUID                DEFAULT NULL,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_oref_referred UNIQUE (referred_owner_id),
    CONSTRAINT fk_oref_referrer FOREIGN KEY (referrer_owner_id) REFERENCES owner(id) ON DELETE CASCADE,
    CONSTRAINT fk_oref_referred FOREIGN KEY (referred_owner_id) REFERENCES owner(id) ON DELETE SET NULL,
    CONSTRAINT fk_oref_subscription FOREIGN KEY (applied_subscription_id) REFERENCES owner_subscriptions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_oref_referrer ON owner_referrals (referrer_owner_id);
CREATE INDEX IF NOT EXISTS idx_oref_referred ON owner_referrals (referred_owner_id);
CREATE INDEX IF NOT EXISTS idx_oref_code ON owner_referrals (referral_code);
CREATE INDEX IF NOT EXISTS idx_oref_status ON owner_referrals (status);

-- Deferred FK: owner_subscriptions -> owner_referrals
DO $$ BEGIN
    ALTER TABLE owner_subscriptions
        ADD CONSTRAINT fk_osub_referral FOREIGN KEY (referral_id)
        REFERENCES owner_referrals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- TABLE 79: owner_whatsapp_settings
-- Purpose : Per-owner WhatsApp Business API alert configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_whatsapp_settings (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                NOT NULL,
    is_enabled                BOOLEAN             NOT NULL DEFAULT false,
    waba_id                   VARCHAR(100)        DEFAULT NULL,
    phone_number_id           VARCHAR(100)        DEFAULT NULL,
    api_key_encrypted         TEXT                DEFAULT NULL,
    send_emi_reminders        BOOLEAN             NOT NULL DEFAULT true,
    send_payment_receipts     BOOLEAN             NOT NULL DEFAULT true,
    send_overdue_alerts       BOOLEAN             NOT NULL DEFAULT true,
    send_promotional          BOOLEAN             NOT NULL DEFAULT false,
    send_loan_updates         BOOLEAN             NOT NULL DEFAULT true,
    template_config           JSONB               NOT NULL DEFAULT '{}'::jsonb,
    daily_message_limit       INT                 NOT NULL DEFAULT 1000 CHECK (daily_message_limit >= 0),
    messages_sent_today       INT                 NOT NULL DEFAULT 0,
    last_reset_date           DATE                DEFAULT CURRENT_DATE,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT uq_ows_owner UNIQUE (owner_id),
    CONSTRAINT fk_ows_owner FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ows_owner_id ON owner_whatsapp_settings (owner_id);
CREATE INDEX IF NOT EXISTS idx_ows_enabled ON owner_whatsapp_settings (is_enabled) WHERE is_enabled = true;


-- ============================================================
-- TABLE 80: owner_addons
-- Purpose : Modular a la carte feature purchase invoices.
--           Owners can purchase individual feature add-ons WITHOUT upgrading their plan.
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_addons (
    id                        UUID                NOT NULL DEFAULT uuidv7(),
    owner_id                  UUID                NOT NULL,
    addon_code                VARCHAR(50)         NOT NULL,
    addon_name                VARCHAR(150)        NOT NULL,
    price                     DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    currency                  VARCHAR(5)          NOT NULL DEFAULT 'INR',
    paid_amount               DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    discount_amount           DECIMAL(10,2)       NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    payment_id                VARCHAR(255)        DEFAULT NULL,
    payment_gateway           VARCHAR(50)         DEFAULT NULL,
    status                    addon_status_enum   NOT NULL DEFAULT 'active',
    validity_days             INT                 NOT NULL DEFAULT 30 CHECK (validity_days > 0),
    starts_at                 TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at                TIMESTAMP           NOT NULL,
    cancelled_at              TIMESTAMP           DEFAULT NULL,
    quantity                  INT                 NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    auto_renew                BOOLEAN             NOT NULL DEFAULT false,
    subscription_id           UUID                DEFAULT NULL,
    activated_by              VARCHAR(100)        DEFAULT NULL,
    notes                     TEXT                DEFAULT NULL,
    created_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_oa_owner FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
    CONSTRAINT fk_oa_subscription FOREIGN KEY (subscription_id) REFERENCES owner_subscriptions(id) ON DELETE SET NULL,
    CONSTRAINT fk_oa_addon_code FOREIGN KEY (addon_code) REFERENCES system_features(code) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oa_owner_id ON owner_addons (owner_id);
CREATE INDEX IF NOT EXISTS idx_oa_owner_status ON owner_addons (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_oa_addon_code ON owner_addons (addon_code);
CREATE INDEX IF NOT EXISTS idx_oa_status ON owner_addons (status);
CREATE INDEX IF NOT EXISTS idx_oa_expires_at ON owner_addons (expires_at);
CREATE INDEX IF NOT EXISTS idx_oa_payment_id ON owner_addons (payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_oa_one_active_per_addon
    ON owner_addons (owner_id, addon_code)
    WHERE status = 'active'
      AND addon_code NOT IN ('extra_finance_slot', 'extra_user_seat', 'extra_customers_500');

-- Circular FK: owner.active_subscription_id -> owner_subscriptions
DO $$ BEGIN
    ALTER TABLE owner
        ADD CONSTRAINT fk_owner_active_sub
        FOREIGN KEY (active_subscription_id) REFERENCES owner_subscriptions(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- SEED DATA: System Features Registry
-- ============================================================
INSERT INTO system_features (
    code, name, description, category, is_standalone_addon, default_addon_price, display_order, is_active
) VALUES
('online_mode',        'Online Cloud Access',        'Enables cloud sync, multi-device web & real-time connectivity',  'core',          false, 0.00,   1, true),
('offline_mode',       'Offline Local-First Mode',   'Full desktop offline support with local database caching',        'core',          false, 0.00,   2, true),
('ai_chatbot',         'AI Support Chatbot',         '24/7 AI-driven customer enquiry and payment support bot',        'ai',            true,  499.00, 3, true),
('ai_voice_agent',     'AI Telecalling Voice Agent', 'Automated EMI overdue reminders & customer voice calls',         'ai',            true,  999.00, 4, true),
('whatsapp_alerts',    'WhatsApp Business Alerts',    'Automated payment receipts & EMI reminder WhatsApp messages',    'communication', true,  299.00, 5, true),
('customer_app',       'Customer Mobile App',         'End-customer passbook, EMI dues & online payment mobile app',    'mobile',        true,  399.00, 6, true),
('collection_app',     'Collection Agent App',        'Field collection agent live tracking, receipt printing & sync',  'mobile',        true,  599.00, 7, true),
('advanced_reports',   'Advanced Business Reports',   'Custom financial audits, ledger analytics & Excel exports',      'reporting',     true,  399.00, 8, true),
('extra_finance_slot', 'Extra Finance Branch Slot',   'Add 1 additional finance branch to manage under one account',    'capacity',      true,  499.00, 9, true),
('extra_user_seat',    'Extra User/Staff Seat',       'Add 1 additional back-office staff seat with permissions',       'capacity',      true,  199.00, 10, true),
('extra_customers_500','Extra 500 Customer Slots',    'Expand customer management quota by +500 accounts',              'capacity',      true,  299.00, 11, true)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- SEED DATA: Base Subscription Plans (A1, A2, A3, A4)
-- ============================================================
INSERT INTO subscription_plans (
    plan_code, plan_name, description, version,
    price_monthly, price_yearly, currency,
    max_customers, max_finances, max_users,
    display_order, is_popular, trial_days
) VALUES
('A1', 'Basic', 'Offline-only plan for small finance businesses. Manage up to 500 customers with 1 finance branch.',
    1, 499.00, 4999.00, 'INR', 500, 1, 3, 1, false, 30),
('A2', 'Normal', 'Online-enabled plan with unlimited customers and 1 finance branch. Includes customer app access.',
    1, 999.00, 9999.00, 'INR', NULL, 1, 5, 2, true, 30),
('A3', 'Pro', 'Professional plan for growing businesses. Up to 5 finance branches, unlimited customers, collection app access.',
    1, 1999.00, 19999.00, 'INR', NULL, 5, 15, 3, false, 30),
('A4', 'AI Max', 'Enterprise plan with full AI suite - AI Chatbot, AI Voice Agent, WhatsApp automation, and unlimited everything.',
    1, 4999.00, 49999.00, 'INR', NULL, NULL, NULL, 4, false, 30)
ON CONFLICT ON CONSTRAINT uq_plan_code_version DO NOTHING;


-- ============================================================
-- SEED DATA: Plan Feature Mappings
-- ============================================================
INSERT INTO plan_features (plan_id, feature_code, is_included)
SELECT sp.id, f.code, true
FROM subscription_plans sp
CROSS JOIN (
    SELECT 'offline_mode' AS code UNION ALL
    SELECT 'online_mode' UNION ALL
    SELECT 'whatsapp_alerts' UNION ALL
    SELECT 'customer_app' UNION ALL
    SELECT 'collection_app' UNION ALL
    SELECT 'advanced_reports' UNION ALL
    SELECT 'ai_chatbot' UNION ALL
    SELECT 'ai_voice_agent'
) f
WHERE 
    (sp.plan_code = 'A1' AND f.code IN ('offline_mode')) OR
    (sp.plan_code = 'A2' AND f.code IN ('offline_mode', 'online_mode', 'whatsapp_alerts', 'customer_app')) OR
    (sp.plan_code = 'A3' AND f.code IN ('offline_mode', 'online_mode', 'whatsapp_alerts', 'customer_app', 'collection_app', 'advanced_reports')) OR
    (sp.plan_code = 'A4' AND f.code IN ('offline_mode', 'online_mode', 'whatsapp_alerts', 'customer_app', 'collection_app', 'advanced_reports', 'ai_chatbot', 'ai_voice_agent'))
ON CONFLICT (plan_id, feature_code) DO NOTHING;


-- ============================================================
-- FUNCTION: Build Frozen Plan Snapshot (JSONB)
-- ============================================================
CREATE OR REPLACE FUNCTION build_plan_snapshot(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    SELECT jsonb_build_object(
        'plan_id',              sp.id,
        'plan_code',            sp.plan_code,
        'plan_name',            sp.plan_name,
        'version',              sp.version,
        'price_monthly',        sp.price_monthly,
        'price_yearly',         sp.price_yearly,
        'currency',             sp.currency,
        'max_customers',        sp.max_customers,
        'max_finances',         sp.max_finances,
        'max_users',            sp.max_users,
        'features',             COALESCE((
            SELECT jsonb_object_agg(pf.feature_code, pf.is_included)
            FROM plan_features pf
            WHERE pf.plan_id = sp.id
        ), '{}'::jsonb),
        'trial_days',           sp.trial_days,
        'snapshot_taken_at',    CURRENT_TIMESTAMP
    )
    INTO v_snapshot
    FROM subscription_plans sp
    WHERE sp.id = p_plan_id AND sp.is_active = true;

    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    RETURN v_snapshot;
END;
$$;


-- ============================================================
-- FUNCTION: Check Owner Feature Access
-- ============================================================
CREATE OR REPLACE FUNCTION has_feature(p_owner_id UUID, p_feature_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM owner_features
        WHERE owner_id = p_owner_id
          AND feature_code = p_feature_code
          AND is_enabled = true
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    );
END;
$$;


-- ============================================================
-- FUNCTION: Activate Subscription for Owner
-- ============================================================
CREATE OR REPLACE FUNCTION activate_owner_subscription(
    p_owner_id        UUID,
    p_plan_id         UUID,
    p_billing_cycle   billing_cycle_enum,
    p_paid_amount     DECIMAL(10,2),
    p_payment_id      VARCHAR(255) DEFAULT NULL,
    p_payment_gateway VARCHAR(50)  DEFAULT NULL,
    p_is_trial        BOOLEAN      DEFAULT false,
    p_referral_id     UUID         DEFAULT NULL,
    p_discount_amount DECIMAL(10,2) DEFAULT 0.00,
    p_discount_reason VARCHAR(255) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_snapshot         JSONB;
    v_new_sub_id       UUID;
    v_expires_at       TIMESTAMP;
    v_trial_days       INT;
BEGIN
    v_snapshot := build_plan_snapshot(p_plan_id);

    IF p_is_trial THEN
        v_trial_days := COALESCE((v_snapshot->>'trial_days')::INT, 30);
        v_expires_at := CURRENT_TIMESTAMP + (v_trial_days || ' days')::INTERVAL;
    ELSE
        v_expires_at := CASE p_billing_cycle
            WHEN 'monthly'     THEN CURRENT_TIMESTAMP + INTERVAL '1 month'
            WHEN 'quarterly'   THEN CURRENT_TIMESTAMP + INTERVAL '3 months'
            WHEN 'half_yearly' THEN CURRENT_TIMESTAMP + INTERVAL '6 months'
            WHEN 'yearly'      THEN CURRENT_TIMESTAMP + INTERVAL '1 year'
        END;
    END IF;

    UPDATE owner_subscriptions
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE owner_id = p_owner_id AND status IN ('active', 'trial');

    INSERT INTO owner_subscriptions (
        owner_id, plan_id, plan_snapshot, status, billing_cycle,
        starts_at, expires_at, is_trial,
        paid_amount, discount_amount, discount_reason,
        payment_id, payment_gateway, referral_id, activated_by
    ) VALUES (
        p_owner_id, p_plan_id, v_snapshot,
        CASE WHEN p_is_trial THEN 'trial'::subscription_status_enum ELSE 'active'::subscription_status_enum END,
        p_billing_cycle,
        CURRENT_TIMESTAMP, v_expires_at,
        p_is_trial,
        p_paid_amount, p_discount_amount, p_discount_reason,
        p_payment_id, p_payment_gateway, p_referral_id,
        CASE WHEN p_is_trial THEN 'system' ELSE 'self' END
    )
    RETURNING id INTO v_new_sub_id;

    UPDATE owner
    SET active_subscription_id = v_new_sub_id,
        updated_at = CURRENT_TIMESTAMP,
        trial_used = CASE WHEN p_is_trial THEN true ELSE trial_used END
    WHERE id = p_owner_id;

    INSERT INTO owner_features (
        owner_id, feature_code, is_enabled, source, starts_at, expires_at, granted_by
    )
    SELECT
        p_owner_id,
        pf.feature_code,
        pf.is_included,
        'plan',
        CURRENT_TIMESTAMP,
        v_expires_at,
        'plan_activation'
    FROM plan_features pf
    WHERE pf.plan_id = p_plan_id
    ON CONFLICT (owner_id, feature_code) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        source     = CASE 
            WHEN owner_features.source = 'addon' AND (owner_features.expires_at IS NULL OR owner_features.expires_at > CURRENT_TIMESTAMP)
            THEN 'addon' 
            ELSE 'plan' 
        END,
        expires_at = CASE 
            WHEN owner_features.source = 'addon' AND (owner_features.expires_at IS NULL OR owner_features.expires_at > CURRENT_TIMESTAMP)
            THEN owner_features.expires_at 
            ELSE EXCLUDED.expires_at 
        END,
        updated_at = CURRENT_TIMESTAMP;

    RETURN v_new_sub_id;
END;
$$;


-- ============================================================
-- FUNCTION: Activate Add-On for Owner
-- ============================================================
CREATE OR REPLACE FUNCTION activate_owner_addon(
    p_owner_id        UUID,
    p_addon_code      VARCHAR(50),
    p_validity_days   INT,
    p_paid_amount     DECIMAL(10,2),
    p_payment_id      VARCHAR(255) DEFAULT NULL,
    p_payment_gateway VARCHAR(50)  DEFAULT NULL,
    p_quantity        INT          DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_addon_id   UUID;
    v_expires_at TIMESTAMP;
    v_name       VARCHAR(150);
BEGIN
    SELECT name INTO v_name FROM system_features WHERE code = p_addon_code AND is_active = true;
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Feature add-on not found or inactive: %', p_addon_code;
    END IF;

    v_expires_at := CURRENT_TIMESTAMP + (p_validity_days || ' days')::INTERVAL;

    INSERT INTO owner_addons (
        owner_id, addon_code, addon_name, price, paid_amount,
        status, validity_days, starts_at, expires_at,
        quantity, payment_id, payment_gateway, activated_by
    ) VALUES (
        p_owner_id, p_addon_code, v_name, p_paid_amount, p_paid_amount,
        'active', p_validity_days, CURRENT_TIMESTAMP, v_expires_at,
        p_quantity, p_payment_id, p_payment_gateway, 'self'
    )
    RETURNING id INTO v_addon_id;

    INSERT INTO owner_features (
        owner_id, feature_code, is_enabled, source, starts_at, expires_at, granted_by
    ) VALUES (
        p_owner_id, p_addon_code, true, 'addon', CURRENT_TIMESTAMP, v_expires_at, 'addon_purchase'
    )
    ON CONFLICT (owner_id, feature_code) DO UPDATE SET
        is_enabled = true,
        source     = 'addon',
        expires_at = GREATEST(COALESCE(owner_features.expires_at, CURRENT_TIMESTAMP), EXCLUDED.expires_at),
        updated_at = CURRENT_TIMESTAMP;

    RETURN v_addon_id;
END;
$$;


-- ============================================================
-- VIEW 6: v_owner_subscription_status
-- Purpose: Quick runtime overview of owner base plan, validity, and limits
-- ============================================================
CREATE OR REPLACE VIEW v_owner_subscription_status AS
SELECT
    o.id                                          AS owner_id,
    o.username,
    o.license_id,
    o.referral_code,
    o.trial_used,
    o.max_customers_override,
    o.max_finances_override,
    o.max_users_override,
    os.id                                         AS subscription_id,
    os.status                                     AS subscription_status,
    os.billing_cycle,
    os.starts_at,
    os.expires_at,
    os.is_trial,
    os.paid_amount,
    os.payment_id,
    os.plan_snapshot->>'plan_code'                 AS plan_code,
    os.plan_snapshot->>'plan_name'                 AS plan_name,
    (os.plan_snapshot->>'version')::INT            AS plan_version,
    COALESCE(o.max_customers_override, (os.plan_snapshot->>'max_customers')::INT) AS effective_max_customers,
    COALESCE(o.max_finances_override,  (os.plan_snapshot->>'max_finances')::INT)  AS effective_max_finances,
    COALESCE(o.max_users_override,     (os.plan_snapshot->>'max_users')::INT)     AS effective_max_users,
    os.plan_snapshot->'features'                   AS plan_features,
    COALESCE((
        SELECT jsonb_agg(of.feature_code)
        FROM owner_features of
        WHERE of.owner_id = o.id
          AND of.is_enabled = true
          AND (of.expires_at IS NULL OR of.expires_at > CURRENT_TIMESTAMP)
    ), '[]'::jsonb)                               AS active_features,
    CASE
        WHEN os.status = 'trial' AND os.expires_at < CURRENT_TIMESTAMP THEN 'trial_expired'
        WHEN os.status = 'active' AND os.expires_at < CURRENT_TIMESTAMP THEN 'expired'
        ELSE os.status::TEXT
    END                                           AS effective_status,
    GREATEST(0, EXTRACT(EPOCH FROM (os.expires_at - CURRENT_TIMESTAMP)) / 86400)::INT
                                                  AS days_remaining
FROM owner o
LEFT JOIN owner_subscriptions os ON os.id = o.active_subscription_id;


-- ============================================================
-- ACCOUNTING MODULE: acc_ledger_groups DDL & Predefined Tally Seed
-- ============================================================
DO $ BEGIN
    CREATE TYPE acc_group_nature_enum AS ENUM ('Assets', 'Liabilities', 'Income', 'Expenses');
EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
    CREATE TYPE acc_nett_balance_report_enum AS ENUM ('Debit', 'Credit', 'Both');
EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
    CREATE TYPE acc_allocation_method_enum AS ENUM ('By Quantity', 'By Value', 'Not Applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
    CREATE TYPE acc_system_group_type_enum AS ENUM (
        'Primary', 'Sundry Debtors', 'Sundry Creditors', 'Bank Accounts',
        'Cash in Hand', 'Stock in Hand', 'Sales Accounts', 'Purchase Accounts',
        'Direct Income', 'Direct Expenses', 'Indirect Income', 'Indirect Expenses', 'Custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $;

CREATE TABLE IF NOT EXISTS acc_ledger_groups (
    id                      UUID            PRIMARY KEY DEFAULT uuidv7(),
    finance_id              UUID            NOT NULL,
    group_name              VARCHAR(150)    NOT NULL,
    alias                   VARCHAR(150)    DEFAULT NULL,
    alias_lang              JSONB           DEFAULT NULL,
    parent_group_id         UUID            DEFAULT NULL,
    nature                  acc_group_nature_enum NOT NULL,
    affects_gross_profit    BOOLEAN         NOT NULL DEFAULT false,
    behaves_like_subledger  BOOLEAN         NOT NULL DEFAULT false,
    nett_balance_report     acc_nett_balance_report_enum NOT NULL DEFAULT 'Both',
    used_for_calculation    BOOLEAN         NOT NULL DEFAULT false,
    allocation_method       acc_allocation_method_enum NOT NULL DEFAULT 'Not Applicable',
    is_system               BOOLEAN         NOT NULL DEFAULT false,
    system_group_type       acc_system_group_type_enum NOT NULL DEFAULT 'Custom',
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    system_parent_id        UUID            DEFAULT NULL,
    custom_parent_id        UUID            DEFAULT NULL,
    root_master_id          UUID            DEFAULT NULL,
    CONSTRAINT uk_group_name_finance UNIQUE (finance_id, group_name),
    CONSTRAINT fk_alg_finance FOREIGN KEY (finance_id) REFERENCES finance_detail(id) ON DELETE CASCADE,
    CONSTRAINT fk_alg_parent FOREIGN KEY (parent_group_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alg_sys_parent FOREIGN KEY (system_parent_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alg_custom_parent FOREIGN KEY (custom_parent_id) REFERENCES acc_ledger_groups(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alg_root_master FOREIGN KEY (root_master_id) REFERENCES acc_group_master(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_alg_finance_id ON acc_ledger_groups (finance_id);
CREATE INDEX IF NOT EXISTS idx_alg_parent_id ON acc_ledger_groups (parent_group_id);
CREATE INDEX IF NOT EXISTS idx_alg_nature ON acc_ledger_groups (nature);
CREATE INDEX IF NOT EXISTS idx_alg_is_active ON acc_ledger_groups (is_active);
CREATE INDEX IF NOT EXISTS idx_alg_sys_parent_id ON acc_ledger_groups (system_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_custom_parent_id ON acc_ledger_groups (custom_parent_id);
CREATE INDEX IF NOT EXISTS idx_alg_root_master_id ON acc_ledger_groups (root_master_id);

-- 1. Root (Primary) System Groups (15 groups)
INSERT INTO acc_ledger_groups (
    finance_id, group_name, parent_group_id, nature,
    affects_gross_profit, behaves_like_subledger, nett_balance_report,
    used_for_calculation, allocation_method, is_system, system_group_type, is_active
)
SELECT
    f.id,
    v.group_name,
    NULL,
    v.nature::acc_group_nature_enum,
    v.affects_gross_profit,
    FALSE,
    'Both'::acc_nett_balance_report_enum,
    FALSE,
    'Not Applicable'::acc_allocation_method_enum,
    TRUE,
    v.system_group_type::acc_system_group_type_enum,
    TRUE
FROM finance_detail f
CROSS JOIN (
    VALUES
        ('Capital Account',        'Liabilities', 'Primary',           FALSE),
        ('Loans (Liability)',      'Liabilities', 'Primary',           FALSE),
        ('Current Liabilities',    'Liabilities', 'Primary',           FALSE),
        ('Branch / Divisions',     'Liabilities', 'Primary',           FALSE),
        ('Fixed Assets',           'Assets',      'Primary',           FALSE),
        ('Investments',            'Assets',      'Primary',           FALSE),
        ('Current Assets',         'Assets',      'Primary',           FALSE),
        ('Misc. Expenses (Asset)', 'Assets',      'Primary',           FALSE),
        ('Suspense A/c',           'Assets',      'Primary',           FALSE),
        ('Sales Accounts',         'Income',      'Sales Accounts',    TRUE),
        ('Direct Incomes',         'Income',      'Direct Income',     TRUE),
        ('Indirect Incomes',       'Income',      'Indirect Income',   FALSE),
        ('Purchase Accounts',      'Expenses',    'Purchase Accounts', TRUE),
        ('Direct Expenses',        'Expenses',    'Direct Expenses',   TRUE),
        ('Indirect Expenses',      'Expenses',    'Indirect Expenses', FALSE)
) AS v(group_name, nature, system_group_type, affects_gross_profit)
ON CONFLICT (finance_id, group_name) DO NOTHING;

-- 2. Child System Groups (13 groups, resolved via parent_group_id)
INSERT INTO acc_ledger_groups (
    finance_id, group_name, parent_group_id, nature,
    affects_gross_profit, behaves_like_subledger, nett_balance_report,
    used_for_calculation, allocation_method, is_system, system_group_type, is_active
)
SELECT
    f.id,
    v.group_name,
    p.id,
    v.nature::acc_group_nature_enum,
    v.affects_gross_profit,
    FALSE,
    'Both'::acc_nett_balance_report_enum,
    FALSE,
    'Not Applicable'::acc_allocation_method_enum,
    TRUE,
    v.system_group_type::acc_system_group_type_enum,
    TRUE
FROM finance_detail f
CROSS JOIN (
    VALUES
        ('Reserves & Surplus',       'Capital Account',     'Liabilities', 'Primary',          FALSE),
        ('Secured Loans',            'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
        ('Unsecured Loans',          'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
        ('Bank OD A/c',              'Loans (Liability)',   'Liabilities', 'Primary',          FALSE),
        ('Sundry Creditors',         'Current Liabilities', 'Liabilities', 'Sundry Creditors', FALSE),
        ('Duties & Taxes',           'Current Liabilities', 'Liabilities', 'Primary',          FALSE),
        ('Provisions',               'Current Liabilities', 'Liabilities', 'Primary',          FALSE),
        ('Sundry Debtors',           'Current Assets',      'Assets',      'Sundry Debtors',   FALSE),
        ('Cash-in-hand',             'Current Assets',      'Assets',      'Cash in Hand',     FALSE),
        ('Bank Accounts',            'Current Assets',      'Assets',      'Bank Accounts',    FALSE),
        ('Stock-in-hand',            'Current Assets',      'Assets',      'Stock in Hand',    FALSE),
        ('Deposits (Asset)',         'Current Assets',      'Assets',      'Primary',          FALSE),
        ('Loans & Advances (Asset)', 'Current Assets',      'Assets',      'Primary',          FALSE)
) AS v(group_name, parent_name, nature, system_group_type, affects_gross_profit)
INNER JOIN acc_ledger_groups p
    ON p.finance_id = f.id AND p.group_name = v.parent_name
ON CONFLICT (finance_id, group_name) DO NOTHING;

-- ============================================================
COMMIT;

-- ============================================================
-- END OF UNIFIED AUTOFINEX SCHEMA
-- Total: 61 ENUMs | 80 Tables | 19 Functions | 5 Triggers | 6 Views
-- Strictly ZERO ALTER statements used
-- ============================================================

