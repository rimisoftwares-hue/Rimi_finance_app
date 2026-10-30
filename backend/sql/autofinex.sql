--
-- PostgreSQL database dump
--

\restrict o5Mx7KbSYwFlEQfuF5k5ezxU6G47RiG8M5srDy9UAozCFlawdRaZMwbOV4EfZgz

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-09-08 13:40:33

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 5874 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 959 (class 1247 OID 16454)
-- Name: active_cancelled_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.active_cancelled_enum AS ENUM (
    'active',
    'cancelled'
);


ALTER TYPE public.active_cancelled_enum OWNER TO postgres;

--
-- TOC entry 953 (class 1247 OID 16422)
-- Name: address_entity_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.address_entity_type_enum AS ENUM (
    'customer',
    'guardian',
    'user',
    'finance',
    'new_customer'
);


ALTER TYPE public.address_entity_type_enum OWNER TO postgres;

--
-- TOC entry 983 (class 1247 OID 16526)
-- Name: body_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.body_type_enum AS ENUM (
    'sedan',
    'hatchback',
    'suv',
    'muv',
    'coupe',
    'convertible',
    'scooter',
    'bike'
);


ALTER TYPE public.body_type_enum OWNER TO postgres;

--
-- TOC entry 1106 (class 1247 OID 17826)
-- Name: cancellation_reason_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.cancellation_reason_enum AS ENUM (
    'vehicle_not_available',
    'loan_terms_unacceptable',
    'changed_mind',
    'better_offer',
    'financial_issues',
    'found_another_vehicle',
    'other'
);


ALTER TYPE public.cancellation_reason_enum OWNER TO postgres;

--
-- TOC entry 1109 (class 1247 OID 17842)
-- Name: cancellation_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.cancellation_status_enum AS ENUM (
    'requested',
    'approved',
    'rejected',
    'refund_processing',
    'refund_completed'
);


ALTER TYPE public.cancellation_status_enum OWNER TO postgres;

--
-- TOC entry 1112 (class 1247 OID 17854)
-- Name: checklist_item_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.checklist_item_enum AS ENUM (
    'documents_signed',
    'vehicle_delivered',
    'payment_received',
    'rc_transfer',
    'insurance_transfer'
);


ALTER TYPE public.checklist_item_enum OWNER TO postgres;

--
-- TOC entry 947 (class 1247 OID 16408)
-- Name: contact_entity_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.contact_entity_type_enum AS ENUM (
    'customer',
    'guardian'
);


ALTER TYPE public.contact_entity_type_enum OWNER TO postgres;

--
-- TOC entry 950 (class 1247 OID 16414)
-- Name: contact_number_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.contact_number_type_enum AS ENUM (
    'mobile',
    'landline',
    'work'
);


ALTER TYPE public.contact_number_type_enum OWNER TO postgres;

--
-- TOC entry 968 (class 1247 OID 16480)
-- Name: deal_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.deal_type_enum AS ENUM (
    'finance',
    'consulting'
);


ALTER TYPE public.deal_type_enum OWNER TO postgres;

--
-- TOC entry 1115 (class 1247 OID 17866)
-- Name: doc_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.doc_status_enum AS ENUM (
    'not_issued',
    'issued',
    'delivered'
);


ALTER TYPE public.doc_status_enum OWNER TO postgres;

--
-- TOC entry 977 (class 1247 OID 16504)
-- Name: fuel_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.fuel_type_enum AS ENUM (
    'petrol',
    'diesel',
    'electric',
    'cng',
    'hybrid'
);


ALTER TYPE public.fuel_type_enum OWNER TO postgres;

--
-- TOC entry 944 (class 1247 OID 16398)
-- Name: govt_id_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.govt_id_type_enum AS ENUM (
    'pan_card',
    'voter_id',
    'driving_license',
    'other'
);


ALTER TYPE public.govt_id_type_enum OWNER TO postgres;

--
-- TOC entry 986 (class 1247 OID 16544)
-- Name: history_entry_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.history_entry_type_enum AS ENUM (
    'call',
    'rc_book'
);


ALTER TYPE public.history_entry_type_enum OWNER TO postgres;

--
-- TOC entry 1079 (class 1247 OID 17680)
-- Name: kyc_document_side_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_document_side_enum AS ENUM (
    'front',
    'back',
    'single'
);


ALTER TYPE public.kyc_document_side_enum OWNER TO postgres;

--
-- TOC entry 1076 (class 1247 OID 17638)
-- Name: kyc_document_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_document_type_enum AS ENUM (
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
    'other'
);


ALTER TYPE public.kyc_document_type_enum OWNER TO postgres;

--
-- TOC entry 1073 (class 1247 OID 17624)
-- Name: kyc_entity_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_entity_type_enum AS ENUM (
    'customer',
    'guardian',
    'co_applicant',
    'new_customer',
    'finance',
    'user'
);


ALTER TYPE public.kyc_entity_type_enum OWNER TO postgres;

--
-- TOC entry 1085 (class 1247 OID 17696)
-- Name: kyc_uploader_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_uploader_type_enum AS ENUM (
    'staff',
    'customer_app'
);


ALTER TYPE public.kyc_uploader_type_enum OWNER TO postgres;

--
-- TOC entry 1082 (class 1247 OID 17688)
-- Name: kyc_verification_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_verification_status_enum AS ENUM (
    'pending',
    'verified',
    'rejected'
);


ALTER TYPE public.kyc_verification_status_enum OWNER TO postgres;

--
-- TOC entry 1100 (class 1247 OID 17806)
-- Name: loan_application_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.loan_application_status_enum AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE public.loan_application_status_enum OWNER TO postgres;

--
-- TOC entry 941 (class 1247 OID 16390)
-- Name: loan_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.loan_status_enum AS ENUM (
    'active',
    'close',
    'seized'
);


ALTER TYPE public.loan_status_enum OWNER TO postgres;

--
-- TOC entry 1118 (class 1247 OID 17874)
-- Name: mandate_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.mandate_status_enum AS ENUM (
    'active',
    'paused',
    'cancelled',
    'expired'
);


ALTER TYPE public.mandate_status_enum OWNER TO postgres;

--
-- TOC entry 1121 (class 1247 OID 17884)
-- Name: notification_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.notification_type_enum AS ENUM (
    'system',
    'payment_success',
    'loan',
    'promotion',
    'emi_reminder',
    'document_ready',
    'referral'
);


ALTER TYPE public.notification_type_enum OWNER TO postgres;

--
-- TOC entry 1097 (class 1247 OID 17792)
-- Name: occupation_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.occupation_type_enum AS ENUM (
    'salaried',
    'self-employed',
    'retired',
    'unemployed',
    'student',
    'other'
);


ALTER TYPE public.occupation_type_enum OWNER TO postgres;

--
-- TOC entry 1058 (class 1247 OID 17368)
-- Name: office_pay_mode_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.office_pay_mode_enum AS ENUM (
    'Cash',
    'UPI',
    'Bank',
    'Online',
    'Mobile_App'
);


ALTER TYPE public.office_pay_mode_enum OWNER TO postgres;

--
-- TOC entry 992 (class 1247 OID 16572)
-- Name: office_txn_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.office_txn_type_enum AS ENUM (
    'Income',
    'Expense'
);


ALTER TYPE public.office_txn_type_enum OWNER TO postgres;

--
-- TOC entry 1067 (class 1247 OID 17440)
-- Name: online_pay_method_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.online_pay_method_enum AS ENUM (
    'upi',
    'credit_card',
    'debit_card',
    'net_banking',
    'wallet',
    'bank_transfer',
    'auto_pay'
);


ALTER TYPE public.online_pay_method_enum OWNER TO postgres;

--
-- TOC entry 1061 (class 1247 OID 17380)
-- Name: pay_mode_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.pay_mode_enum AS ENUM (
    'cash',
    'online',
    'bank',
    'upi',
    'cheque',
    'mobile_app',
    'other'
);


ALTER TYPE public.pay_mode_enum OWNER TO postgres;

--
-- TOC entry 956 (class 1247 OID 16446)
-- Name: payment_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_status_enum AS ENUM (
    'pending',
    'partial',
    'paid'
);


ALTER TYPE public.payment_status_enum OWNER TO postgres;

--
-- TOC entry 1064 (class 1247 OID 17426)
-- Name: payment_transaction_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_transaction_status_enum AS ENUM (
    'initiated',
    'pending',
    'success',
    'failed',
    'cancelled',
    'refunded'
);


ALTER TYPE public.payment_transaction_status_enum OWNER TO postgres;

--
-- TOC entry 971 (class 1247 OID 16486)
-- Name: rc_holder_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rc_holder_enum AS ENUM (
    'Company',
    'customer',
    'third_party',
    'pending'
);


ALTER TYPE public.rc_holder_enum OWNER TO postgres;

--
-- TOC entry 974 (class 1247 OID 16496)
-- Name: rc_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rc_status_enum AS ENUM (
    'original',
    'duplicate',
    'not_available'
);


ALTER TYPE public.rc_status_enum OWNER TO postgres;

--
-- TOC entry 1124 (class 1247 OID 17900)
-- Name: referral_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.referral_status_enum AS ENUM (
    'pending',
    'converted',
    'expired'
);


ALTER TYPE public.referral_status_enum OWNER TO postgres;

--
-- TOC entry 1094 (class 1247 OID 17780)
-- Name: relation_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.relation_type_enum AS ENUM (
    'S/O',
    'D/O',
    'F/O',
    'W/O',
    'M/O'
);


ALTER TYPE public.relation_type_enum OWNER TO postgres;

--
-- TOC entry 1127 (class 1247 OID 17908)
-- Name: rewards_txn_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rewards_txn_type_enum AS ENUM (
    'earned',
    'redeemed',
    'expired',
    'adjusted'
);


ALTER TYPE public.rewards_txn_type_enum OWNER TO postgres;

--
-- TOC entry 962 (class 1247 OID 16460)
-- Name: seizing_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.seizing_status_enum AS ENUM (
    'Pending',
    'Paid',
    'Cancelled'
);


ALTER TYPE public.seizing_status_enum OWNER TO postgres;

--
-- TOC entry 1130 (class 1247 OID 17918)
-- Name: support_ticket_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.support_ticket_status_enum AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


ALTER TYPE public.support_ticket_status_enum OWNER TO postgres;

--
-- TOC entry 1103 (class 1247 OID 17820)
-- Name: terms_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.terms_type_enum AS ENUM (
    'pre_booking',
    'loan_agreement'
);


ALTER TYPE public.terms_type_enum OWNER TO postgres;

--
-- TOC entry 980 (class 1247 OID 16516)
-- Name: transmission_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transmission_enum AS ENUM (
    'manual',
    'automatic',
    'cvt',
    'amt'
);


ALTER TYPE public.transmission_enum OWNER TO postgres;

--
-- TOC entry 989 (class 1247 OID 16550)
-- Name: user_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role_enum AS ENUM (
    'owner',
    'admin',
    'agent',
    'staff'
);


ALTER TYPE public.user_role_enum OWNER TO postgres;

--
-- TOC entry 1052 (class 1247 OID 17322)
-- Name: vehicle_media_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.vehicle_media_type_enum AS ENUM (
    'front',
    'side',
    'back',
    'interior',
    'additional',
    'video'
);


ALTER TYPE public.vehicle_media_type_enum OWNER TO postgres;

--
-- TOC entry 965 (class 1247 OID 16468)
-- Name: vehicle_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.vehicle_status_enum AS ENUM (
    'available',
    'hosted',
    'sales',
    'seized',
    'sold'
);


ALTER TYPE public.vehicle_status_enum OWNER TO postgres;

--
-- TOC entry 319 (class 1255 OID 17927)
-- Name: fn_auto_link_mob_customer(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_auto_link_mob_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_customer_account_id INTEGER;
  v_has_primary BOOLEAN;
BEGIN
  IF NEW.aadhar_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- mob_customers.finance_id is NOT NULL (it's part of the composite FK
  -- back to customers(finance_id, aadhar_id)). Without this guard, a
  -- customers row with NULL finance_id whose aadhar matches an existing
  -- linked person throws a NOT NULL violation INSIDE the trigger, which
  -- aborts the staff's entire INSERT/UPDATE on "customers" -- confirmed
  -- by testing. Skip linking (safe no-op) instead of crashing it.
  IF NEW.finance_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM "mob_customers" WHERE customer_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT mc.customer_account_id INTO v_customer_account_id
  FROM "mob_customers" mc
  JOIN "customers" c ON c.id = mc.customer_id
  WHERE c.aadhar_id = NEW.aadhar_id
  LIMIT 1;

  IF v_customer_account_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "mob_customers"
      WHERE customer_account_id = v_customer_account_id AND is_primary_link
    ) INTO v_has_primary;

    INSERT INTO "mob_customers" (customer_account_id, customer_id, finance_id, aadhar_id, is_primary_link)
    VALUES (v_customer_account_id, NEW.id, NEW.finance_id, NEW.aadhar_id, NOT v_has_primary)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_auto_link_mob_customer() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 236 (class 1259 OID 16849)
-- Name: address_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.address_history (
    id integer NOT NULL,
    entity_type public.address_entity_type_enum NOT NULL,
    entity_id character varying(50) NOT NULL,
    address_id integer NOT NULL,
    is_current smallint DEFAULT 1,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.address_history OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16848)
-- Name: address_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.address_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.address_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 16818)
-- Name: addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addresses (
    id integer NOT NULL,
    house_no character varying(50) DEFAULT NULL::character varying,
    street character varying(100) DEFAULT NULL::character varying,
    street_name character varying(100) DEFAULT NULL::character varying,
    village character varying(100) DEFAULT NULL::character varying,
    land_mark character varying(100) DEFAULT NULL::character varying,
    address character varying(225) DEFAULT NULL::character varying,
    city character varying(100) DEFAULT NULL::character varying,
    district character varying(100) DEFAULT NULL::character varying,
    state character varying(100) DEFAULT NULL::character varying,
    pincode character varying(10) DEFAULT NULL::character varying,
    location character varying(255) DEFAULT NULL::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    latitude numeric(10,7) DEFAULT NULL::numeric,
    longitude numeric(10,7) DEFAULT NULL::numeric,
    label character varying(20) DEFAULT NULL::character varying
);


ALTER TABLE public.addresses OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16817)
-- Name: addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.addresses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 277 (class 1259 OID 18136)
-- Name: app_payment_methods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_payment_methods (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    method_type public.online_pay_method_enum NOT NULL,
    gateway_token character varying(255) NOT NULL,
    display_label character varying(100) NOT NULL,
    masked_identifier character varying(50) DEFAULT NULL::character varying,
    issuer_name character varying(100) DEFAULT NULL::character varying,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.app_payment_methods OWNER TO postgres;

--
-- TOC entry 276 (class 1259 OID 18135)
-- Name: app_payment_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.app_payment_methods ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.app_payment_methods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 283 (class 1259 OID 18222)
-- Name: auto_debit_mandates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auto_debit_mandates (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    loan_id integer NOT NULL,
    payment_method_id integer,
    mandate_ref character varying(100) DEFAULT NULL::character varying,
    max_amount numeric(12,2) DEFAULT NULL::numeric,
    status public.mandate_status_enum DEFAULT 'active'::public.mandate_status_enum NOT NULL,
    start_date date,
    next_debit_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.auto_debit_mandates OWNER TO postgres;

--
-- TOC entry 282 (class 1259 OID 18221)
-- Name: auto_debit_mandates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.auto_debit_mandates ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auto_debit_mandates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 16790)
-- Name: contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contacts (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    contact_type public.contact_entity_type_enum NOT NULL,
    type public.contact_number_type_enum NOT NULL,
    number character varying(20) NOT NULL,
    finance_id integer
);


ALTER TABLE public.contacts OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16789)
-- Name: contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.contacts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 265 (class 1259 OID 17930)
-- Name: customer_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_accounts (
    id integer NOT NULL,
    mobile_number character varying(15) NOT NULL,
    country_code character varying(5) DEFAULT '+91'::character varying NOT NULL,
    full_name character varying(100) DEFAULT NULL::character varying,
    email character varying(150) DEFAULT NULL::character varying,
    dob date,
    is_profile_complete boolean DEFAULT false NOT NULL,
    push_notifications_consent boolean DEFAULT false NOT NULL,
    location_tracking_consent boolean DEFAULT false NOT NULL,
    biometric_lock_enabled boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.customer_accounts OWNER TO postgres;

--
-- TOC entry 5875 (class 0 OID 0)
-- Dependencies: 265
-- Name: TABLE customer_accounts; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.customer_accounts IS 'App-side identity (mobile+OTP). Independent of "customers" back-office ledger row. See mob_customers for the link.';


--
-- TOC entry 264 (class 1259 OID 17929)
-- Name: customer_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_accounts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customer_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 228 (class 1259 OID 16715)
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    finance_id integer,
    hplno integer,
    "loanStatus" public.loan_status_enum NOT NULL,
    "brokerName" character varying(100) DEFAULT NULL::character varying,
    cname character varying(100) NOT NULL,
    cfname_value character varying(100) DEFAULT NULL::character varying,
    cfname_unit character varying(10) DEFAULT NULL::character varying,
    cphoto character varying(255) DEFAULT NULL::character varying,
    "cvehiclePhoto" character varying(255) DEFAULT NULL::character varying,
    "cpropertyPhoto" character varying(255) DEFAULT NULL::character varying,
    vehicle_id integer,
    aadhar_id character varying(12) DEFAULT NULL::character varying,
    other_govt_id_type public.govt_id_type_enum,
    other_govt_id_number character varying(50) DEFAULT NULL::character varying,
    profession character varying(100) DEFAULT NULL::character varying,
    work_office_address text,
    work_office_phone character varying(15) DEFAULT NULL::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16714)
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 287 (class 1259 OID 18283)
-- Name: delivery_checklist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.delivery_checklist (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    item public.checklist_item_enum NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at timestamp without time zone,
    notes character varying(255) DEFAULT NULL::character varying
);


ALTER TABLE public.delivery_checklist OWNER TO postgres;

--
-- TOC entry 286 (class 1259 OID 18282)
-- Name: delivery_checklist_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.delivery_checklist ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.delivery_checklist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 293 (class 1259 OID 18373)
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    customer_account_id integer,
    loan_id integer,
    doc_type character varying(100) NOT NULL,
    status public.doc_status_enum DEFAULT 'not_issued'::public.doc_status_enum NOT NULL,
    file_url character varying(500) DEFAULT NULL::character varying,
    issued_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- TOC entry 292 (class 1259 OID 18372)
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.documents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 16610)
-- Name: finance_detail; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_detail (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    finance_name character varying(255) NOT NULL,
    phone_numbers jsonb NOT NULL,
    emails jsonb,
    is_active smallint DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    finance_photo character varying(255) DEFAULT NULL::character varying,
    since character varying(20) DEFAULT NULL::character varying
);


ALTER TABLE public.finance_detail OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16609)
-- Name: finance_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_detail ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.finance_detail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 244 (class 1259 OID 16971)
-- Name: godowns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.godowns (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    finance_id integer,
    name character varying(150) NOT NULL,
    address character varying(255) DEFAULT NULL::character varying,
    city character varying(100) DEFAULT NULL::character varying,
    contact_person character varying(150) DEFAULT NULL::character varying,
    contact_number character varying(20) DEFAULT NULL::character varying,
    is_active smallint DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.godowns OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 16970)
-- Name: godowns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.godowns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.godowns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 16753)
-- Name: guardians; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guardians (
    id integer NOT NULL,
    finance_id integer,
    customer_id integer NOT NULL,
    gname character varying(100) NOT NULL,
    gfname_value character varying(100) DEFAULT NULL::character varying,
    gfname_unit character varying(10) DEFAULT NULL::character varying,
    gphoto character varying(255) DEFAULT NULL::character varying,
    "gpropertyPhoto" character varying(255) DEFAULT NULL::character varying,
    aadhar_id character varying(12) DEFAULT NULL::character varying,
    other_govt_id_type public.govt_id_type_enum,
    other_govt_id_number character varying(50) DEFAULT NULL::character varying,
    profession character varying(100) DEFAULT NULL::character varying,
    remarks character varying(100) DEFAULT NULL::character varying,
    work_office_address text,
    work_office_phone character varying(15) DEFAULT NULL::character varying
);


ALTER TABLE public.guardians OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16752)
-- Name: guardians_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.guardians ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.guardians_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 248 (class 1259 OID 17043)
-- Name: history_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.history_entries (
    id integer NOT NULL,
    finance_id integer,
    customer_id integer NOT NULL,
    entry_type public.history_entry_type_enum NOT NULL,
    message text NOT NULL,
    entry_date date NOT NULL,
    created_by character varying(255) DEFAULT NULL::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.history_entries OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 17042)
-- Name: history_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.history_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.history_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 261 (class 1259 OID 17702)
-- Name: kyc_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kyc_documents (
    id integer NOT NULL,
    entity_type public.kyc_entity_type_enum NOT NULL,
    entity_id character varying(50) NOT NULL,
    document_type public.kyc_document_type_enum NOT NULL,
    side public.kyc_document_side_enum DEFAULT 'single'::public.kyc_document_side_enum NOT NULL,
    file_name character varying(255),
    file_path text NOT NULL,
    file_size bigint,
    mime_type character varying(100),
    uploaded_by character varying(100),
    uploaded_by_type public.kyc_uploader_type_enum DEFAULT 'staff'::public.kyc_uploader_type_enum NOT NULL,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_current boolean DEFAULT true NOT NULL,
    verification_status public.kyc_verification_status_enum DEFAULT 'pending'::public.kyc_verification_status_enum NOT NULL,
    verified_by character varying(100) DEFAULT NULL::character varying,
    verified_at timestamp without time zone,
    rejection_reason character varying(255) DEFAULT NULL::character varying,
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_kycdocs_side_valid CHECK ((((document_type = ANY (ARRAY['aadhar_card'::public.kyc_document_type_enum, 'driving_license'::public.kyc_document_type_enum, 'voter_id'::public.kyc_document_type_enum])) AND (side = ANY (ARRAY['front'::public.kyc_document_side_enum, 'back'::public.kyc_document_side_enum]))) OR ((document_type <> ALL (ARRAY['aadhar_card'::public.kyc_document_type_enum, 'driving_license'::public.kyc_document_type_enum, 'voter_id'::public.kyc_document_type_enum])) AND (side = 'single'::public.kyc_document_side_enum))))
);


ALTER TABLE public.kyc_documents OWNER TO postgres;

--
-- TOC entry 5876 (class 0 OID 0)
-- Dependencies: 261
-- Name: TABLE kyc_documents; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.kyc_documents IS 'Single source of truth for identity/KYC proof files — file storage, entity link, version history (is_current) and staff verification workflow all in one row. Pre-conversion mobile applicants use entity_type=new_customer with entity_id = loan_applications.id.';


--
-- TOC entry 260 (class 1259 OID 17701)
-- Name: kyc_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.kyc_documents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kyc_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 275 (class 1259 OID 18068)
-- Name: loan_applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan_applications (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    vehicle_detail_id integer NOT NULL,
    finance_id integer,
    status public.loan_application_status_enum DEFAULT 'draft'::public.loan_application_status_enum NOT NULL,
    relative_name character varying(100) DEFAULT NULL::character varying,
    relation_type public.relation_type_enum DEFAULT 'S/O'::public.relation_type_enum NOT NULL,
    alter_native_num character varying(15) DEFAULT NULL::character varying,
    occupation_type public.occupation_type_enum DEFAULT 'salaried'::public.occupation_type_enum NOT NULL,
    occupation_other_type character varying(50) DEFAULT NULL::character varying,
    occupation_name character varying(50) DEFAULT NULL::character varying,
    monthly_income numeric(12,2) DEFAULT NULL::numeric,
    payment_id integer,
    down_payment numeric(15,2) DEFAULT NULL::numeric,
    outstanding_amount numeric(15,2) DEFAULT NULL::numeric,
    interest_rate numeric(5,2) DEFAULT NULL::numeric,
    tenure_months smallint,
    monthly_due_amount numeric(15,2) DEFAULT NULL::numeric,
    first_due_date date,
    due_month integer,
    visiting_date date,
    visiting_time time without time zone,
    pre_booking_amount numeric(12,2) DEFAULT NULL::numeric,
    submitted_at timestamp without time zone,
    decided_at timestamp without time zone,
    rejection_reason text,
    converted_loan_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_loanapp_amounts_nonneg CHECK ((((down_payment IS NULL) OR (down_payment >= (0)::numeric)) AND ((outstanding_amount IS NULL) OR (outstanding_amount >= (0)::numeric)) AND ((interest_rate IS NULL) OR (interest_rate >= (0)::numeric)) AND ((monthly_due_amount IS NULL) OR (monthly_due_amount >= (0)::numeric)) AND ((pre_booking_amount IS NULL) OR (pre_booking_amount >= (0)::numeric)) AND ((monthly_income IS NULL) OR (monthly_income >= (0)::numeric)) AND ((tenure_months IS NULL) OR (tenure_months > 0)))),
    CONSTRAINT chk_loanapp_due_month CHECK (((due_month IS NULL) OR ((due_month >= 1) AND (due_month <= 31))))
);


ALTER TABLE public.loan_applications OWNER TO postgres;

--
-- TOC entry 274 (class 1259 OID 18067)
-- Name: loan_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.loan_applications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loan_applications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 289 (class 1259 OID 18302)
-- Name: loan_cancellations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan_cancellations (
    id integer NOT NULL,
    loan_application_id integer,
    loan_id integer,
    reason public.cancellation_reason_enum NOT NULL,
    additional_details text,
    status public.cancellation_status_enum DEFAULT 'requested'::public.cancellation_status_enum NOT NULL,
    reservation_fee_refund numeric(12,2) DEFAULT 0 NOT NULL,
    cancellation_fee numeric(12,2) DEFAULT 0 NOT NULL,
    refund_method character varying(50) DEFAULT NULL::character varying,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at timestamp without time zone,
    CONSTRAINT chk_cancel_target CHECK (((loan_application_id IS NOT NULL) OR (loan_id IS NOT NULL)))
);


ALTER TABLE public.loan_cancellations OWNER TO postgres;

--
-- TOC entry 288 (class 1259 OID 18301)
-- Name: loan_cancellations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.loan_cancellations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loan_cancellations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 285 (class 1259 OID 18255)
-- Name: loan_terms_agreements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan_terms_agreements (
    id integer NOT NULL,
    loan_application_id integer,
    loan_id integer,
    terms_type public.terms_type_enum NOT NULL,
    terms_version character varying(20) NOT NULL,
    accepted boolean DEFAULT true NOT NULL,
    accepted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address character varying(45) DEFAULT NULL::character varying,
    device_info character varying(150) DEFAULT NULL::character varying,
    CONSTRAINT chk_terms_target CHECK (((loan_application_id IS NOT NULL) OR (loan_id IS NOT NULL)))
);


ALTER TABLE public.loan_terms_agreements OWNER TO postgres;

--
-- TOC entry 284 (class 1259 OID 18254)
-- Name: loan_terms_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.loan_terms_agreements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loan_terms_agreements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 238 (class 1259 OID 16871)
-- Name: loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loans (
    id integer NOT NULL,
    finance_id integer,
    customer_id integer NOT NULL,
    loan_type character varying(50) NOT NULL,
    "hpAmount" numeric(15,2) DEFAULT NULL::numeric,
    "hpDate" date,
    due_date date,
    "dueMonth" integer,
    "interestRate" numeric(5,2) DEFAULT NULL::numeric,
    "penaltyAmount" numeric(15,2) DEFAULT NULL::numeric,
    penalty_days integer DEFAULT 0 NOT NULL,
    principle_part numeric(15,2) DEFAULT NULL::numeric,
    interest_part numeric(15,2) DEFAULT NULL::numeric,
    "dueAmount" numeric(15,2) DEFAULT NULL::numeric,
    down_payment numeric(15,2) DEFAULT NULL::numeric,
    net_payment numeric(15,2) DEFAULT NULL::numeric,
    net_payable numeric(15,2) DEFAULT NULL::numeric,
    pay_mode_1_amount numeric(15,2) DEFAULT NULL::numeric,
    hand_loan numeric(15,2) DEFAULT NULL::numeric,
    hand_loan_remarks text,
    broker_name character varying(100) DEFAULT NULL::character varying,
    dealer_name character varying(100) DEFAULT NULL::character varying,
    documentation_charge numeric(15,2) DEFAULT NULL::numeric,
    broker_commission numeric(15,2) DEFAULT NULL::numeric,
    remarks text
);


ALTER TABLE public.loans OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16870)
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.loans ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 271 (class 1259 OID 18003)
-- Name: mob_customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mob_customers (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    customer_id integer NOT NULL,
    finance_id integer NOT NULL,
    aadhar_id character varying(12) NOT NULL,
    is_primary_link boolean DEFAULT false NOT NULL,
    linked_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.mob_customers OWNER TO postgres;

--
-- TOC entry 270 (class 1259 OID 18002)
-- Name: mob_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.mob_customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mob_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 259 (class 1259 OID 17456)
-- Name: mobile_app_payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mobile_app_payment (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    finance_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    payment_for character varying(30) DEFAULT 'due_payment'::character varying,
    method public.online_pay_method_enum NOT NULL,
    gateway_name character varying(50),
    gateway_order_id character varying(150),
    gateway_payment_id character varying(150),
    gateway_signature character varying(255),
    gateway_response jsonb,
    status public.payment_transaction_status_enum DEFAULT 'initiated'::public.payment_transaction_status_enum,
    failure_reason text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.mobile_app_payment OWNER TO postgres;

--
-- TOC entry 258 (class 1259 OID 17455)
-- Name: mobile_app_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.mobile_app_payment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mobile_app_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 273 (class 1259 OID 18038)
-- Name: mobile_down_payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mobile_down_payment (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    finance_id integer NOT NULL,
    loan_application_id integer,
    amount numeric(15,2) NOT NULL,
    method public.online_pay_method_enum NOT NULL,
    gateway_name character varying(50),
    gateway_order_id character varying(150),
    gateway_payment_id character varying(150),
    gateway_signature character varying(255),
    gateway_response jsonb,
    status public.payment_transaction_status_enum DEFAULT 'initiated'::public.payment_transaction_status_enum,
    failure_reason text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.mobile_down_payment OWNER TO postgres;

--
-- TOC entry 272 (class 1259 OID 18037)
-- Name: mobile_down_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.mobile_down_payment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mobile_down_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 297 (class 1259 OID 18423)
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_settings (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    sms_enabled boolean DEFAULT true NOT NULL,
    whatsapp_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notification_settings OWNER TO postgres;

--
-- TOC entry 296 (class 1259 OID 18422)
-- Name: notification_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notification_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 299 (class 1259 OID 18448)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    type public.notification_type_enum DEFAULT 'system'::public.notification_type_enum NOT NULL,
    title character varying(150) NOT NULL,
    body character varying(500) DEFAULT NULL::character varying,
    deep_link character varying(255) DEFAULT NULL::character varying,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 298 (class 1259 OID 18447)
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 250 (class 1259 OID 17077)
-- Name: office_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.office_expenses (
    id integer NOT NULL,
    finance_id integer NOT NULL,
    transaction_type public.office_txn_type_enum NOT NULL,
    expense_date date NOT NULL,
    category character varying(255) NOT NULL,
    description character varying(500) DEFAULT NULL::character varying,
    amount numeric(15,2) NOT NULL,
    entered_by character varying(150) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.office_expenses OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 17076)
-- Name: office_expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.office_expenses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.office_expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 267 (class 1259 OID 17959)
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp_verifications (
    id integer NOT NULL,
    mobile_number character varying(15) NOT NULL,
    otp_hash character varying(255) NOT NULL,
    purpose character varying(30) DEFAULT 'login_or_signup'::character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    attempt_count smallint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.otp_verifications OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 17958)
-- Name: otp_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.otp_verifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.otp_verifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 220 (class 1259 OID 16586)
-- Name: owner; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.owner (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    reset_token character varying(255) DEFAULT NULL::character varying,
    reset_token_expiry timestamp without time zone,
    is_active smallint DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.owner OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16585)
-- Name: owner_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.owner ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.owner_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 240 (class 1259 OID 16915)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    finance_id integer,
    customer_id integer NOT NULL,
    "dueDate" date,
    "paymentDate" date NOT NULL,
    "billNumber" character varying(50) DEFAULT NULL::character varying,
    amount numeric(15,2) DEFAULT NULL::numeric,
    status public.payment_status_enum DEFAULT 'pending'::public.payment_status_enum,
    payment_status public.active_cancelled_enum DEFAULT 'active'::public.active_cancelled_enum,
    cancelled_by character varying(100) DEFAULT NULL::character varying,
    penalty numeric(15,2) DEFAULT NULL::numeric,
    collected_by character varying(100) DEFAULT NULL::character varying,
    hand_loan numeric(15,2) DEFAULT NULL::numeric,
    hand_loan_remark text,
    payment_mode_1_amount numeric(15,2) DEFAULT NULL::numeric,
    remarks text,
    edited_by character varying(100) DEFAULT NULL::character varying,
    edited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    mobile_app_payment_id integer
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 16914)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 281 (class 1259 OID 18195)
-- Name: penalties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.penalties (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    overdue_days integer NOT NULL,
    per_day_rate numeric(10,2) DEFAULT NULL::numeric,
    base_penalty numeric(12,2) NOT NULL,
    other_charges numeric(12,2) DEFAULT 0 NOT NULL,
    total_penalty numeric(12,2) NOT NULL,
    calculated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    settled_payment_id integer
);


ALTER TABLE public.penalties OWNER TO postgres;

--
-- TOC entry 280 (class 1259 OID 18194)
-- Name: penalties_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.penalties ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.penalties_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 291 (class 1259 OID 18334)
-- Name: provider_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.provider_reviews (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    loan_id integer NOT NULL,
    finance_id integer NOT NULL,
    rating smallint NOT NULL,
    review_text character varying(500) DEFAULT NULL::character varying,
    is_pinned boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_review_rating CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.provider_reviews OWNER TO postgres;

--
-- TOC entry 290 (class 1259 OID 18333)
-- Name: provider_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.provider_reviews ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.provider_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 279 (class 1259 OID 18165)
-- Name: receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipts (
    id integer NOT NULL,
    down_payment_id integer,
    app_payment_id integer,
    receipt_number character varying(50) NOT NULL,
    file_url character varying(500) DEFAULT NULL::character varying,
    generated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_receipt_one_source CHECK ((((down_payment_id IS NOT NULL) AND (app_payment_id IS NULL)) OR ((down_payment_id IS NULL) AND (app_payment_id IS NOT NULL))))
);


ALTER TABLE public.receipts OWNER TO postgres;

--
-- TOC entry 278 (class 1259 OID 18164)
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.receipts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 307 (class 1259 OID 33525)
-- Name: recent_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recent_activity (
    id integer NOT NULL,
    finance_id integer NOT NULL,
    type character varying(50) NOT NULL,
    reference_id character varying(100),
    description text,
    amount numeric(15,2),
    created_by character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.recent_activity OWNER TO postgres;

--
-- TOC entry 306 (class 1259 OID 33524)
-- Name: recent_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recent_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recent_activity_id_seq OWNER TO postgres;

--
-- TOC entry 5877 (class 0 OID 0)
-- Dependencies: 306
-- Name: recent_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recent_activity_id_seq OWNED BY public.recent_activity.id;


--
-- TOC entry 301 (class 1259 OID 18473)
-- Name: referrals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referrals (
    id integer NOT NULL,
    referrer_customer_account_id integer NOT NULL,
    referral_code character varying(20) NOT NULL,
    referred_mobile_number character varying(15) DEFAULT NULL::character varying,
    referred_customer_account_id integer,
    status public.referral_status_enum DEFAULT 'pending'::public.referral_status_enum NOT NULL,
    reward_points integer DEFAULT 0 NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.referrals OWNER TO postgres;

--
-- TOC entry 300 (class 1259 OID 18472)
-- Name: referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.referrals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.referrals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 269 (class 1259 OID 17978)
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    token_hash character varying(255) NOT NULL,
    device_id character varying(150) DEFAULT NULL::character varying,
    device_name character varying(150) DEFAULT NULL::character varying,
    platform character varying(20) DEFAULT NULL::character varying,
    issued_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone,
    last_used_at timestamp without time zone
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- TOC entry 268 (class 1259 OID 17977)
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.refresh_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 303 (class 1259 OID 18502)
-- Name: rewards_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rewards_ledger (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    txn_type public.rewards_txn_type_enum NOT NULL,
    points integer NOT NULL,
    balance_after integer NOT NULL,
    reference_type character varying(50) DEFAULT NULL::character varying,
    reference_id integer,
    description character varying(255) DEFAULT NULL::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.rewards_ledger OWNER TO postgres;

--
-- TOC entry 302 (class 1259 OID 18501)
-- Name: rewards_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.rewards_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rewards_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 246 (class 1259 OID 17001)
-- Name: seizing_vehicle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seizing_vehicle (
    id integer NOT NULL,
    finance_id integer NOT NULL,
    customer_id integer NOT NULL,
    vehicle_id integer NOT NULL,
    seizing_charge numeric(10,2) NOT NULL,
    description character varying(255) DEFAULT NULL::character varying,
    seized_by character varying(150) NOT NULL,
    seizing_date date NOT NULL,
    status public.seizing_status_enum DEFAULT 'Pending'::public.seizing_status_enum,
    release_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bill_number character varying(50) DEFAULT NULL::character varying,
    godown_id integer
);


ALTER TABLE public.seizing_vehicle OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 17000)
-- Name: seizing_vehicle_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.seizing_vehicle ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.seizing_vehicle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 242 (class 1259 OID 16937)
-- Name: sub_due; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sub_due (
    id integer NOT NULL,
    finance_id integer NOT NULL,
    customer_id integer NOT NULL,
    payment_id integer NOT NULL,
    bill_number character varying(50) NOT NULL,
    payment_date date NOT NULL,
    paid_amount numeric(15,2) NOT NULL,
    payment_mode_amount numeric(15,2) DEFAULT NULL::numeric,
    payment_mode_1_amount numeric(15,2) DEFAULT NULL::numeric,
    status public.active_cancelled_enum DEFAULT 'active'::public.active_cancelled_enum,
    collected_by character varying(100) DEFAULT NULL::character varying,
    cancelled_by character varying(100) DEFAULT NULL::character varying,
    edited_by character varying(100) DEFAULT NULL::character varying,
    edited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    mobile_app_payment_id integer
);


ALTER TABLE public.sub_due OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 16936)
-- Name: sub_due_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sub_due ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sub_due_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 305 (class 1259 OID 18523)
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_tickets (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    category character varying(100) NOT NULL,
    subject character varying(150) NOT NULL,
    description text,
    status public.support_ticket_status_enum DEFAULT 'open'::public.support_ticket_status_enum NOT NULL,
    assigned_to integer,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.support_tickets OWNER TO postgres;

--
-- TOC entry 304 (class 1259 OID 18522)
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.support_tickets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.support_tickets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 252 (class 1259 OID 17106)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    user_id character varying(36) NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(100) NOT NULL,
    phone_no character varying(15) NOT NULL,
    password character varying(255) NOT NULL,
    user_role public.user_role_enum NOT NULL,
    allowed_companies jsonb DEFAULT '[]'::jsonb,
    login_time_from time without time zone,
    login_time_to time without time zone,
    last_login timestamp without time zone,
    is_active smallint DEFAULT 1,
    reset_token character varying(255) DEFAULT NULL::character varying,
    reset_token_expiry timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 17137)
-- Name: users_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users_details (
    id character varying(36) NOT NULL,
    finance_id integer NOT NULL,
    staff_name character varying(255) NOT NULL,
    staff_code character varying(50) DEFAULT NULL::character varying,
    father_spouse_name character varying(255) DEFAULT NULL::character varying,
    experience_years integer DEFAULT 0,
    education_qualification character varying(255) DEFAULT NULL::character varying,
    photo character varying(255) DEFAULT NULL::character varying,
    joining_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users_details OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 17105)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 263 (class 1259 OID 17742)
-- Name: vehicle_assured; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_assured (
    id integer NOT NULL,
    finance_id integer NOT NULL,
    vehicle_id integer NOT NULL,
    assurance_name character varying(150) NOT NULL,
    remarks text,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vehicle_assured OWNER TO postgres;

--
-- TOC entry 262 (class 1259 OID 17741)
-- Name: vehicle_assured_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicle_assured ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_assured_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 16666)
-- Name: vehicle_detail; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_detail (
    id integer NOT NULL,
    finance_id integer,
    vehicle_info_id integer,
    vehicle_number character varying(100) NOT NULL,
    vehicle_modal character varying(10) DEFAULT NULL::character varying,
    chassis_number character varying(255) DEFAULT NULL::character varying,
    engine_number character varying(255) DEFAULT NULL::character varying,
    num_owner integer DEFAULT 1,
    trip_driven integer DEFAULT 0,
    color character varying(100) DEFAULT NULL::character varying,
    variant character varying(100) DEFAULT NULL::character varying,
    selling_price numeric(12,2) DEFAULT NULL::numeric,
    emi_from numeric(10,2) DEFAULT NULL::numeric,
    base_price numeric(12,2) NOT NULL,
    final_price numeric(12,2) NOT NULL,
    status public.vehicle_status_enum DEFAULT 'available'::public.vehicle_status_enum,
    created_date date,
    selling_date date,
    deal_type public.deal_type_enum NOT NULL,
    rc_holder public.rc_holder_enum DEFAULT 'Company'::public.rc_holder_enum,
    rc_status public.rc_status_enum DEFAULT 'original'::public.rc_status_enum,
    fc_expiry_date date,
    insurance_expiry_date date,
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    minimum_down_payment numeric(12,2) DEFAULT NULL::numeric
);


ALTER TABLE public.vehicle_detail OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16665)
-- Name: vehicle_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicle_detail ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_detail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 255 (class 1259 OID 17169)
-- Name: vehicle_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_expenses (
    id integer NOT NULL,
    finance_id integer,
    vehicle_id integer NOT NULL,
    expense_date date NOT NULL,
    description character varying(500) NOT NULL,
    amount numeric(15,2) DEFAULT NULL::numeric,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vehicle_expenses OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 17168)
-- Name: vehicle_expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicle_expenses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 224 (class 1259 OID 16638)
-- Name: vehicle_info; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_info (
    id integer NOT NULL,
    brand character varying(100) NOT NULL,
    model_name character varying(255) NOT NULL,
    make_year smallint NOT NULL,
    fuel_type public.fuel_type_enum NOT NULL,
    engine_capacity character varying(50) NOT NULL,
    fuel_tank_capacity character varying(50) DEFAULT NULL::character varying,
    max_torque character varying(50) DEFAULT NULL::character varying,
    top_speed character varying(50) DEFAULT NULL::character varying,
    mileage character varying(50) DEFAULT NULL::character varying,
    transmission public.transmission_enum,
    seating_capacity integer,
    body_type public.body_type_enum,
    base_price numeric(12,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vehicle_info OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16637)
-- Name: vehicle_info_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicle_info ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_info_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 257 (class 1259 OID 17336)
-- Name: vehicle_media; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicle_media (
    id integer NOT NULL,
    finance_id integer,
    vehicle_id integer NOT NULL,
    media_url character varying(500) NOT NULL,
    media_type public.vehicle_media_type_enum NOT NULL,
    thumbnail_url character varying(500) DEFAULT NULL::character varying,
    is_primary smallint DEFAULT 0,
    file_size integer,
    duration_seconds integer,
    upload_date date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vehicle_media OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 17335)
-- Name: vehicle_media_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vehicle_media ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 295 (class 1259 OID 18400)
-- Name: wishlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wishlist (
    id integer NOT NULL,
    customer_account_id integer NOT NULL,
    vehicle_detail_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.wishlist OWNER TO postgres;

--
-- TOC entry 294 (class 1259 OID 18399)
-- Name: wishlist_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.wishlist ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wishlist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 5342 (class 2604 OID 33528)
-- Name: recent_activity id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recent_activity ALTER COLUMN id SET DEFAULT nextval('public.recent_activity_id_seq'::regclass);


--
-- TOC entry 5429 (class 2606 OID 16859)
-- Name: address_history address_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.address_history
    ADD CONSTRAINT address_history_pkey PRIMARY KEY (id);


--
-- TOC entry 5418 (class 2606 OID 16838)
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- TOC entry 5579 (class 2606 OID 18157)
-- Name: app_payment_methods app_payment_methods_customer_account_id_gateway_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_payment_methods
    ADD CONSTRAINT app_payment_methods_customer_account_id_gateway_token_key UNIQUE (customer_account_id, gateway_token);


--
-- TOC entry 5581 (class 2606 OID 18155)
-- Name: app_payment_methods app_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_payment_methods
    ADD CONSTRAINT app_payment_methods_pkey PRIMARY KEY (id);


--
-- TOC entry 5595 (class 2606 OID 18237)
-- Name: auto_debit_mandates auto_debit_mandates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auto_debit_mandates
    ADD CONSTRAINT auto_debit_mandates_pkey PRIMARY KEY (id);


--
-- TOC entry 5409 (class 2606 OID 16801)
-- Name: contacts contacts_customer_id_number_contact_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_customer_id_number_contact_type_key UNIQUE (customer_id, number, contact_type);


--
-- TOC entry 5411 (class 2606 OID 16799)
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- TOC entry 5546 (class 2606 OID 17956)
-- Name: customer_accounts customer_accounts_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_mobile_number_key UNIQUE (mobile_number);


--
-- TOC entry 5548 (class 2606 OID 17954)
-- Name: customer_accounts customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_pkey PRIMARY KEY (id);


--
-- TOC entry 5393 (class 2606 OID 16736)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- TOC entry 5602 (class 2606 OID 18295)
-- Name: delivery_checklist delivery_checklist_loan_id_item_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_checklist
    ADD CONSTRAINT delivery_checklist_loan_id_item_key UNIQUE (loan_id, item);


--
-- TOC entry 5604 (class 2606 OID 18293)
-- Name: delivery_checklist delivery_checklist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_checklist
    ADD CONSTRAINT delivery_checklist_pkey PRIMARY KEY (id);


--
-- TOC entry 5615 (class 2606 OID 18386)
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- TOC entry 5361 (class 2606 OID 16627)
-- Name: finance_detail finance_detail_owner_id_finance_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_detail
    ADD CONSTRAINT finance_detail_owner_id_finance_name_key UNIQUE (owner_id, finance_name);


--
-- TOC entry 5363 (class 2606 OID 16625)
-- Name: finance_detail finance_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_detail
    ADD CONSTRAINT finance_detail_pkey PRIMARY KEY (id);


--
-- TOC entry 5456 (class 2606 OID 16987)
-- Name: godowns godowns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.godowns
    ADD CONSTRAINT godowns_pkey PRIMARY KEY (id);


--
-- TOC entry 5401 (class 2606 OID 16773)
-- Name: guardians guardians_aadhar_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_aadhar_id_key UNIQUE (aadhar_id);


--
-- TOC entry 5403 (class 2606 OID 16771)
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);


--
-- TOC entry 5467 (class 2606 OID 17057)
-- Name: history_entries history_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.history_entries
    ADD CONSTRAINT history_entries_pkey PRIMARY KEY (id);


--
-- TOC entry 5535 (class 2606 OID 17725)
-- Name: kyc_documents kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 5576 (class 2606 OID 18099)
-- Name: loan_applications loan_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT loan_applications_pkey PRIMARY KEY (id);


--
-- TOC entry 5608 (class 2606 OID 18320)
-- Name: loan_cancellations loan_cancellations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_cancellations
    ADD CONSTRAINT loan_cancellations_pkey PRIMARY KEY (id);


--
-- TOC entry 5600 (class 2606 OID 18269)
-- Name: loan_terms_agreements loan_terms_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_terms_agreements
    ADD CONSTRAINT loan_terms_agreements_pkey PRIMARY KEY (id);


--
-- TOC entry 5442 (class 2606 OID 16897)
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- TOC entry 5562 (class 2606 OID 18018)
-- Name: mob_customers mob_customers_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mob_customers
    ADD CONSTRAINT mob_customers_customer_id_key UNIQUE (customer_id);


--
-- TOC entry 5564 (class 2606 OID 18016)
-- Name: mob_customers mob_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mob_customers
    ADD CONSTRAINT mob_customers_pkey PRIMARY KEY (id);


--
-- TOC entry 5526 (class 2606 OID 17471)
-- Name: mobile_app_payment mobile_app_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_app_payment
    ADD CONSTRAINT mobile_app_payment_pkey PRIMARY KEY (id);


--
-- TOC entry 5571 (class 2606 OID 18052)
-- Name: mobile_down_payment mobile_down_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_down_payment
    ADD CONSTRAINT mobile_down_payment_pkey PRIMARY KEY (id);


--
-- TOC entry 5623 (class 2606 OID 18441)
-- Name: notification_settings notification_settings_customer_account_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_customer_account_id_key UNIQUE (customer_account_id);


--
-- TOC entry 5625 (class 2606 OID 18439)
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 5628 (class 2606 OID 18465)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5481 (class 2606 OID 17094)
-- Name: office_expenses office_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.office_expenses
    ADD CONSTRAINT office_expenses_pkey PRIMARY KEY (id);


--
-- TOC entry 5552 (class 2606 OID 17975)
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5357 (class 2606 OID 16601)
-- Name: owner owner_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner
    ADD CONSTRAINT owner_pkey PRIMARY KEY (id);


--
-- TOC entry 5359 (class 2606 OID 16603)
-- Name: owner owner_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.owner
    ADD CONSTRAINT owner_username_key UNIQUE (username);


--
-- TOC entry 5448 (class 2606 OID 16935)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5593 (class 2606 OID 18209)
-- Name: penalties penalties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penalties
    ADD CONSTRAINT penalties_pkey PRIMARY KEY (id);


--
-- TOC entry 5611 (class 2606 OID 18355)
-- Name: provider_reviews provider_reviews_customer_account_id_loan_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_reviews
    ADD CONSTRAINT provider_reviews_customer_account_id_loan_id_key UNIQUE (customer_account_id, loan_id);


--
-- TOC entry 5613 (class 2606 OID 18353)
-- Name: provider_reviews provider_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_reviews
    ADD CONSTRAINT provider_reviews_pkey PRIMARY KEY (id);


--
-- TOC entry 5584 (class 2606 OID 18183)
-- Name: receipts receipts_app_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_app_payment_id_key UNIQUE (app_payment_id);


--
-- TOC entry 5586 (class 2606 OID 18181)
-- Name: receipts receipts_down_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_down_payment_id_key UNIQUE (down_payment_id);


--
-- TOC entry 5588 (class 2606 OID 18177)
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- TOC entry 5590 (class 2606 OID 18179)
-- Name: receipts receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_receipt_number_key UNIQUE (receipt_number);


--
-- TOC entry 5645 (class 2606 OID 33536)
-- Name: recent_activity recent_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recent_activity
    ADD CONSTRAINT recent_activity_pkey PRIMARY KEY (id);


--
-- TOC entry 5631 (class 2606 OID 18487)
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- TOC entry 5633 (class 2606 OID 18489)
-- Name: referrals referrals_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referral_code_key UNIQUE (referral_code);


--
-- TOC entry 5555 (class 2606 OID 17993)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5557 (class 2606 OID 17995)
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 5636 (class 2606 OID 18515)
-- Name: rewards_ledger rewards_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rewards_ledger
    ADD CONSTRAINT rewards_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 5464 (class 2606 OID 17017)
-- Name: seizing_vehicle seizing_vehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seizing_vehicle
    ADD CONSTRAINT seizing_vehicle_pkey PRIMARY KEY (id);


--
-- TOC entry 5454 (class 2606 OID 16956)
-- Name: sub_due sub_due_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_due
    ADD CONSTRAINT sub_due_pkey PRIMARY KEY (id);


--
-- TOC entry 5640 (class 2606 OID 18539)
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- TOC entry 5542 (class 2606 OID 17757)
-- Name: vehicle_assured uq_vehicle_assurance; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_assured
    ADD CONSTRAINT uq_vehicle_assurance UNIQUE (vehicle_id, assurance_name);


--
-- TOC entry 5504 (class 2606 OID 17153)
-- Name: users_details users_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_details
    ADD CONSTRAINT users_details_pkey PRIMARY KEY (id);


--
-- TOC entry 5506 (class 2606 OID 17155)
-- Name: users_details users_details_staff_code_finance_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_details
    ADD CONSTRAINT users_details_staff_code_finance_id_key UNIQUE (staff_code, finance_id);


--
-- TOC entry 5487 (class 2606 OID 17128)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5489 (class 2606 OID 17132)
-- Name: users users_phone_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_no_key UNIQUE (phone_no);


--
-- TOC entry 5491 (class 2606 OID 17124)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5493 (class 2606 OID 17126)
-- Name: users users_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_id_key UNIQUE (user_id);


--
-- TOC entry 5495 (class 2606 OID 17130)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 5398 (class 2606 OID 17778)
-- Name: customers ux_customers_finance_aadhar; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT ux_customers_finance_aadhar UNIQUE (finance_id, aadhar_id);


--
-- TOC entry 5544 (class 2606 OID 17755)
-- Name: vehicle_assured vehicle_assured_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_assured
    ADD CONSTRAINT vehicle_assured_pkey PRIMARY KEY (id);


--
-- TOC entry 5385 (class 2606 OID 16695)
-- Name: vehicle_detail vehicle_detail_chassis_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT vehicle_detail_chassis_number_key UNIQUE (chassis_number);


--
-- TOC entry 5387 (class 2606 OID 16697)
-- Name: vehicle_detail vehicle_detail_engine_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT vehicle_detail_engine_number_key UNIQUE (engine_number);


--
-- TOC entry 5389 (class 2606 OID 16691)
-- Name: vehicle_detail vehicle_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT vehicle_detail_pkey PRIMARY KEY (id);


--
-- TOC entry 5391 (class 2606 OID 16693)
-- Name: vehicle_detail vehicle_detail_vehicle_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT vehicle_detail_vehicle_number_key UNIQUE (vehicle_number);


--
-- TOC entry 5514 (class 2606 OID 17182)
-- Name: vehicle_expenses vehicle_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_expenses
    ADD CONSTRAINT vehicle_expenses_pkey PRIMARY KEY (id);


--
-- TOC entry 5376 (class 2606 OID 16657)
-- Name: vehicle_info vehicle_info_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_info
    ADD CONSTRAINT vehicle_info_pkey PRIMARY KEY (id);


--
-- TOC entry 5520 (class 2606 OID 17350)
-- Name: vehicle_media vehicle_media_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_media
    ADD CONSTRAINT vehicle_media_pkey PRIMARY KEY (id);


--
-- TOC entry 5619 (class 2606 OID 18411)
-- Name: wishlist wishlist_customer_account_id_vehicle_detail_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_customer_account_id_vehicle_detail_id_key UNIQUE (customer_account_id, vehicle_detail_id);


--
-- TOC entry 5621 (class 2606 OID 18409)
-- Name: wishlist wishlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_pkey PRIMARY KEY (id);


--
-- TOC entry 5364 (class 1259 OID 16636)
-- Name: ft_finance_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ft_finance_name ON public.finance_detail USING gin (to_tsvector('simple'::regconfig, (finance_name)::text));


--
-- TOC entry 5399 (class 1259 OID 16788)
-- Name: ft_gname; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ft_gname ON public.guardians USING gin (to_tsvector('simple'::regconfig, (gname)::text));


--
-- TOC entry 5465 (class 1259 OID 17075)
-- Name: ft_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ft_message ON public.history_entries USING gin (to_tsvector('simple'::regconfig, message));


--
-- TOC entry 5507 (class 1259 OID 17198)
-- Name: ft_ve_description; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ft_ve_description ON public.vehicle_expenses USING gin (to_tsvector('simple'::regconfig, (description)::text));


--
-- TOC entry 5419 (class 1259 OID 16841)
-- Name: idx_addresses_city; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_city ON public.addresses USING btree (city);


--
-- TOC entry 5420 (class 1259 OID 16845)
-- Name: idx_addresses_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_created_at ON public.addresses USING btree (created_at);


--
-- TOC entry 5421 (class 1259 OID 16840)
-- Name: idx_addresses_district; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_district ON public.addresses USING btree (district);


--
-- TOC entry 5422 (class 1259 OID 16842)
-- Name: idx_addresses_pincode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_pincode ON public.addresses USING btree (pincode);


--
-- TOC entry 5423 (class 1259 OID 16839)
-- Name: idx_addresses_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_state ON public.addresses USING btree (state);


--
-- TOC entry 5424 (class 1259 OID 16844)
-- Name: idx_addresses_state_city; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_state_city ON public.addresses USING btree (state, city);


--
-- TOC entry 5425 (class 1259 OID 16843)
-- Name: idx_addresses_village; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_village ON public.addresses USING btree (village);


--
-- TOC entry 5430 (class 1259 OID 16866)
-- Name: idx_ah_address_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ah_address_id ON public.address_history USING btree (address_id);


--
-- TOC entry 5431 (class 1259 OID 16868)
-- Name: idx_ah_changed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ah_changed_at ON public.address_history USING btree (changed_at);


--
-- TOC entry 5432 (class 1259 OID 16869)
-- Name: idx_ah_entity_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ah_entity_address ON public.address_history USING btree (entity_type, entity_id, address_id);


--
-- TOC entry 5433 (class 1259 OID 16865)
-- Name: idx_ah_entity_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ah_entity_type_id ON public.address_history USING btree (entity_type, entity_id);


--
-- TOC entry 5434 (class 1259 OID 16867)
-- Name: idx_ah_is_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ah_is_current ON public.address_history USING btree (is_current);


--
-- TOC entry 5582 (class 1259 OID 18163)
-- Name: idx_apm_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_apm_account ON public.app_payment_methods USING btree (customer_account_id);


--
-- TOC entry 5605 (class 1259 OID 18331)
-- Name: idx_cancel_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cancel_loan ON public.loan_cancellations USING btree (loan_id);


--
-- TOC entry 5606 (class 1259 OID 18332)
-- Name: idx_cancel_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cancel_status ON public.loan_cancellations USING btree (status);


--
-- TOC entry 5412 (class 1259 OID 16813)
-- Name: idx_contacts_contact_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type);


--
-- TOC entry 5413 (class 1259 OID 16812)
-- Name: idx_contacts_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_customer_id ON public.contacts USING btree (customer_id);


--
-- TOC entry 5414 (class 1259 OID 16816)
-- Name: idx_contacts_customer_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_customer_type ON public.contacts USING btree (customer_id, contact_type);


--
-- TOC entry 5415 (class 1259 OID 16815)
-- Name: idx_contacts_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_finance_id ON public.contacts USING btree (finance_id);


--
-- TOC entry 5416 (class 1259 OID 16814)
-- Name: idx_contacts_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contacts_number ON public.contacts USING btree (number);


--
-- TOC entry 5549 (class 1259 OID 17957)
-- Name: idx_customer_accounts_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customer_accounts_active ON public.customer_accounts USING btree (is_active);


--
-- TOC entry 5394 (class 1259 OID 16749)
-- Name: idx_customers_finance_hplno; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_finance_hplno ON public.customers USING btree (finance_id, hplno);


--
-- TOC entry 5395 (class 1259 OID 16750)
-- Name: idx_customers_loan_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_loan_status ON public.customers USING btree ("loanStatus");


--
-- TOC entry 5396 (class 1259 OID 16751)
-- Name: idx_customers_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_vehicle_id ON public.customers USING btree (vehicle_id);


--
-- TOC entry 5616 (class 1259 OID 18397)
-- Name: idx_doc_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doc_account ON public.documents USING btree (customer_account_id);


--
-- TOC entry 5617 (class 1259 OID 18398)
-- Name: idx_doc_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doc_loan ON public.documents USING btree (loan_id);


--
-- TOC entry 5365 (class 1259 OID 16635)
-- Name: idx_finance_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_finance_created_at ON public.finance_detail USING btree (created_at);


--
-- TOC entry 5366 (class 1259 OID 16634)
-- Name: idx_finance_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_finance_is_active ON public.finance_detail USING btree (is_active);


--
-- TOC entry 5367 (class 1259 OID 16633)
-- Name: idx_finance_owner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_finance_owner_id ON public.finance_detail USING btree (owner_id);


--
-- TOC entry 5426 (class 1259 OID 16846)
-- Name: idx_ft_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ft_address ON public.addresses USING gin (to_tsvector('simple'::regconfig, (COALESCE(address, ''::character varying))::text));


--
-- TOC entry 5427 (class 1259 OID 16847)
-- Name: idx_ft_city_district; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ft_city_district ON public.addresses USING gin (to_tsvector('simple'::regconfig, (((COALESCE(city, ''::character varying))::text || ' '::text) || (COALESCE(district, ''::character varying))::text)));


--
-- TOC entry 5457 (class 1259 OID 16999)
-- Name: idx_godowns_finance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_godowns_finance ON public.godowns USING btree (finance_id);


--
-- TOC entry 5458 (class 1259 OID 16998)
-- Name: idx_godowns_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_godowns_owner ON public.godowns USING btree (owner_id);


--
-- TOC entry 5404 (class 1259 OID 16784)
-- Name: idx_guardians_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guardians_customer_id ON public.guardians USING btree (customer_id);


--
-- TOC entry 5405 (class 1259 OID 16787)
-- Name: idx_guardians_finance_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guardians_finance_customer ON public.guardians USING btree (finance_id, customer_id);


--
-- TOC entry 5406 (class 1259 OID 16785)
-- Name: idx_guardians_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guardians_finance_id ON public.guardians USING btree (finance_id);


--
-- TOC entry 5407 (class 1259 OID 16786)
-- Name: idx_guardians_profession; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guardians_profession ON public.guardians USING btree (profession);


--
-- TOC entry 5468 (class 1259 OID 17072)
-- Name: idx_he_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_created_at ON public.history_entries USING btree (created_at);


--
-- TOC entry 5469 (class 1259 OID 17073)
-- Name: idx_he_customer_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_customer_date ON public.history_entries USING btree (customer_id, entry_date);


--
-- TOC entry 5470 (class 1259 OID 17068)
-- Name: idx_he_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_customer_id ON public.history_entries USING btree (customer_id);


--
-- TOC entry 5471 (class 1259 OID 17071)
-- Name: idx_he_entry_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_entry_date ON public.history_entries USING btree (entry_date);


--
-- TOC entry 5472 (class 1259 OID 17070)
-- Name: idx_he_entry_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_entry_type ON public.history_entries USING btree (entry_type);


--
-- TOC entry 5473 (class 1259 OID 17074)
-- Name: idx_he_finance_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_finance_customer ON public.history_entries USING btree (finance_id, customer_id);


--
-- TOC entry 5474 (class 1259 OID 17069)
-- Name: idx_he_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_he_finance_id ON public.history_entries USING btree (finance_id);


--
-- TOC entry 5527 (class 1259 OID 17726)
-- Name: idx_kycdocs_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_entity ON public.kyc_documents USING btree (entity_type, entity_id);


--
-- TOC entry 5528 (class 1259 OID 17727)
-- Name: idx_kycdocs_entity_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_entity_current ON public.kyc_documents USING btree (entity_type, entity_id, is_current);


--
-- TOC entry 5529 (class 1259 OID 17728)
-- Name: idx_kycdocs_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_type ON public.kyc_documents USING btree (document_type);


--
-- TOC entry 5530 (class 1259 OID 17729)
-- Name: idx_kycdocs_type_side; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_type_side ON public.kyc_documents USING btree (document_type, side);


--
-- TOC entry 5531 (class 1259 OID 17731)
-- Name: idx_kycdocs_uploaded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_uploaded_at ON public.kyc_documents USING btree (uploaded_at);


--
-- TOC entry 5532 (class 1259 OID 17732)
-- Name: idx_kycdocs_uploader_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_uploader_type ON public.kyc_documents USING btree (uploaded_by_type);


--
-- TOC entry 5533 (class 1259 OID 17730)
-- Name: idx_kycdocs_verification; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kycdocs_verification ON public.kyc_documents USING btree (verification_status);


--
-- TOC entry 5572 (class 1259 OID 18125)
-- Name: idx_loanapp_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loanapp_account ON public.loan_applications USING btree (customer_account_id);


--
-- TOC entry 5573 (class 1259 OID 18127)
-- Name: idx_loanapp_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loanapp_status ON public.loan_applications USING btree (status);


--
-- TOC entry 5574 (class 1259 OID 18126)
-- Name: idx_loanapp_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loanapp_vehicle ON public.loan_applications USING btree (vehicle_detail_id);


--
-- TOC entry 5435 (class 1259 OID 16912)
-- Name: idx_loans_broker_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_broker_name ON public.loans USING btree (broker_name);


--
-- TOC entry 5436 (class 1259 OID 16909)
-- Name: idx_loans_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_customer_id ON public.loans USING btree (customer_id);


--
-- TOC entry 5437 (class 1259 OID 16913)
-- Name: idx_loans_dealer_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_dealer_name ON public.loans USING btree (dealer_name);


--
-- TOC entry 5438 (class 1259 OID 16910)
-- Name: idx_loans_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_due_date ON public.loans USING btree (due_date);


--
-- TOC entry 5439 (class 1259 OID 16908)
-- Name: idx_loans_finance_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_finance_customer ON public.loans USING btree (finance_id, customer_id);


--
-- TOC entry 5440 (class 1259 OID 16911)
-- Name: idx_loans_hp_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loans_hp_date ON public.loans USING btree ("hpDate");


--
-- TOC entry 5596 (class 1259 OID 18253)
-- Name: idx_mandate_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mandate_loan ON public.auto_debit_mandates USING btree (loan_id);


--
-- TOC entry 5521 (class 1259 OID 17482)
-- Name: idx_map_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_map_customer_id ON public.mobile_app_payment USING btree (customer_id);


--
-- TOC entry 5522 (class 1259 OID 17483)
-- Name: idx_map_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_map_finance_id ON public.mobile_app_payment USING btree (finance_id);


--
-- TOC entry 5523 (class 1259 OID 17484)
-- Name: idx_map_gateway_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_map_gateway_payment_id ON public.mobile_app_payment USING btree (gateway_payment_id);


--
-- TOC entry 5524 (class 1259 OID 17485)
-- Name: idx_map_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_map_status ON public.mobile_app_payment USING btree (status);


--
-- TOC entry 5558 (class 1259 OID 18036)
-- Name: idx_mc_aadhar; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_aadhar ON public.mob_customers USING btree (aadhar_id);


--
-- TOC entry 5559 (class 1259 OID 18034)
-- Name: idx_mc_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_account ON public.mob_customers USING btree (customer_account_id);


--
-- TOC entry 5560 (class 1259 OID 18035)
-- Name: idx_mc_finance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_finance ON public.mob_customers USING btree (finance_id);


--
-- TOC entry 5565 (class 1259 OID 18063)
-- Name: idx_mdp_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mdp_account ON public.mobile_down_payment USING btree (customer_account_id);


--
-- TOC entry 5566 (class 1259 OID 18064)
-- Name: idx_mdp_finance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mdp_finance ON public.mobile_down_payment USING btree (finance_id);


--
-- TOC entry 5567 (class 1259 OID 18065)
-- Name: idx_mdp_gateway_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mdp_gateway_payment_id ON public.mobile_down_payment USING btree (gateway_payment_id);


--
-- TOC entry 5568 (class 1259 OID 18134)
-- Name: idx_mdp_loanapp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mdp_loanapp ON public.mobile_down_payment USING btree (loan_application_id);


--
-- TOC entry 5569 (class 1259 OID 18066)
-- Name: idx_mdp_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mdp_status ON public.mobile_down_payment USING btree (status);


--
-- TOC entry 5626 (class 1259 OID 18471)
-- Name: idx_notif_account_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notif_account_unread ON public.notifications USING btree (customer_account_id, is_read, created_at DESC);


--
-- TOC entry 5475 (class 1259 OID 17101)
-- Name: idx_oe_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oe_category ON public.office_expenses USING btree (category);


--
-- TOC entry 5476 (class 1259 OID 17103)
-- Name: idx_oe_entered_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oe_entered_by ON public.office_expenses USING btree (entered_by);


--
-- TOC entry 5477 (class 1259 OID 17100)
-- Name: idx_oe_expense_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oe_expense_date ON public.office_expenses USING btree (expense_date);


--
-- TOC entry 5478 (class 1259 OID 17104)
-- Name: idx_oe_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oe_finance_id ON public.office_expenses USING btree (finance_id);


--
-- TOC entry 5479 (class 1259 OID 17102)
-- Name: idx_oe_transaction_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oe_transaction_type ON public.office_expenses USING btree (transaction_type);


--
-- TOC entry 5550 (class 1259 OID 17976)
-- Name: idx_otp_mobile_purpose; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_mobile_purpose ON public.otp_verifications USING btree (mobile_number, purpose, created_at DESC);


--
-- TOC entry 5351 (class 1259 OID 16605)
-- Name: idx_owner_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_owner_created_at ON public.owner USING btree (created_at);


--
-- TOC entry 5352 (class 1259 OID 16604)
-- Name: idx_owner_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_owner_is_active ON public.owner USING btree (is_active);


--
-- TOC entry 5353 (class 1259 OID 16606)
-- Name: idx_owner_reset_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_owner_reset_token ON public.owner USING btree (reset_token);


--
-- TOC entry 5354 (class 1259 OID 16608)
-- Name: idx_owner_reset_token_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_owner_reset_token_expiry ON public.owner USING btree (reset_token_expiry);


--
-- TOC entry 5355 (class 1259 OID 16607)
-- Name: idx_owner_username_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_owner_username_active ON public.owner USING btree (username, is_active);


--
-- TOC entry 5443 (class 1259 OID 17492)
-- Name: idx_payments_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_customer_id ON public.payments USING btree (customer_id);


--
-- TOC entry 5444 (class 1259 OID 17493)
-- Name: idx_payments_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_finance_id ON public.payments USING btree (finance_id);


--
-- TOC entry 5445 (class 1259 OID 17491)
-- Name: idx_payments_mobile_app_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_mobile_app_payment_id ON public.payments USING btree (mobile_app_payment_id);


--
-- TOC entry 5446 (class 1259 OID 17494)
-- Name: idx_payments_payment_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_payment_date ON public.payments USING btree ("paymentDate");


--
-- TOC entry 5591 (class 1259 OID 18220)
-- Name: idx_penalty_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_penalty_loan ON public.penalties USING btree (loan_id);


--
-- TOC entry 5641 (class 1259 OID 33543)
-- Name: idx_recent_activity_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recent_activity_created_at ON public.recent_activity USING btree (created_at);


--
-- TOC entry 5642 (class 1259 OID 33544)
-- Name: idx_recent_activity_finance_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recent_activity_finance_date ON public.recent_activity USING btree (finance_id, created_at);


--
-- TOC entry 5643 (class 1259 OID 33542)
-- Name: idx_recent_activity_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recent_activity_finance_id ON public.recent_activity USING btree (finance_id);


--
-- TOC entry 5629 (class 1259 OID 18500)
-- Name: idx_referral_referrer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_referral_referrer ON public.referrals USING btree (referrer_customer_account_id);


--
-- TOC entry 5553 (class 1259 OID 18001)
-- Name: idx_refresh_tokens_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_account ON public.refresh_tokens USING btree (customer_account_id);


--
-- TOC entry 5609 (class 1259 OID 18371)
-- Name: idx_review_finance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_review_finance ON public.provider_reviews USING btree (finance_id);


--
-- TOC entry 5634 (class 1259 OID 18521)
-- Name: idx_rewards_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rewards_account ON public.rewards_ledger USING btree (customer_account_id, created_at DESC);


--
-- TOC entry 5459 (class 1259 OID 17040)
-- Name: idx_seizing_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_seizing_customer ON public.seizing_vehicle USING btree (customer_id);


--
-- TOC entry 5460 (class 1259 OID 17041)
-- Name: idx_seizing_finance; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_seizing_finance ON public.seizing_vehicle USING btree (finance_id);


--
-- TOC entry 5461 (class 1259 OID 17039)
-- Name: idx_seizing_godown; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_seizing_godown ON public.seizing_vehicle USING btree (godown_id);


--
-- TOC entry 5462 (class 1259 OID 17038)
-- Name: idx_seizing_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_seizing_vehicle_id ON public.seizing_vehicle USING btree (vehicle_id);


--
-- TOC entry 5449 (class 1259 OID 16968)
-- Name: idx_subdue_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subdue_customer_id ON public.sub_due USING btree (customer_id);


--
-- TOC entry 5450 (class 1259 OID 16969)
-- Name: idx_subdue_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subdue_finance_id ON public.sub_due USING btree (finance_id);


--
-- TOC entry 5451 (class 1259 OID 17500)
-- Name: idx_subdue_mobile_app_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subdue_mobile_app_payment_id ON public.sub_due USING btree (mobile_app_payment_id);


--
-- TOC entry 5452 (class 1259 OID 16967)
-- Name: idx_subdue_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subdue_payment_id ON public.sub_due USING btree (payment_id);


--
-- TOC entry 5597 (class 1259 OID 18281)
-- Name: idx_terms_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_terms_loan ON public.loan_terms_agreements USING btree (loan_id);


--
-- TOC entry 5598 (class 1259 OID 18280)
-- Name: idx_terms_loanapp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_terms_loanapp ON public.loan_terms_agreements USING btree (loan_application_id);


--
-- TOC entry 5637 (class 1259 OID 18550)
-- Name: idx_ticket_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_account ON public.support_tickets USING btree (customer_account_id);


--
-- TOC entry 5638 (class 1259 OID 18551)
-- Name: idx_ticket_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ticket_status ON public.support_tickets USING btree (status);


--
-- TOC entry 5496 (class 1259 OID 17167)
-- Name: idx_ud_finance_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_finance_created ON public.users_details USING btree (finance_id, created_at);


--
-- TOC entry 5497 (class 1259 OID 17161)
-- Name: idx_ud_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_finance_id ON public.users_details USING btree (finance_id);


--
-- TOC entry 5498 (class 1259 OID 17165)
-- Name: idx_ud_finance_joining_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_finance_joining_date ON public.users_details USING btree (finance_id, joining_date);


--
-- TOC entry 5499 (class 1259 OID 17164)
-- Name: idx_ud_finance_staff_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_finance_staff_name ON public.users_details USING btree (finance_id, staff_name);


--
-- TOC entry 5500 (class 1259 OID 17163)
-- Name: idx_ud_joining_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_joining_date ON public.users_details USING btree (joining_date);


--
-- TOC entry 5501 (class 1259 OID 17166)
-- Name: idx_ud_staff_code_finance_comp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_staff_code_finance_comp ON public.users_details USING btree (staff_code, finance_id, staff_name);


--
-- TOC entry 5502 (class 1259 OID 17162)
-- Name: idx_ud_staff_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ud_staff_name ON public.users_details USING btree (staff_name);


--
-- TOC entry 5482 (class 1259 OID 17136)
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- TOC entry 5483 (class 1259 OID 17134)
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- TOC entry 5484 (class 1259 OID 17135)
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_last_login ON public.users USING btree (last_login);


--
-- TOC entry 5485 (class 1259 OID 17133)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (user_role);


--
-- TOC entry 5537 (class 1259 OID 17776)
-- Name: idx_va_assurance_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_va_assurance_name ON public.vehicle_assured USING btree (assurance_name);


--
-- TOC entry 5538 (class 1259 OID 17775)
-- Name: idx_va_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_va_created_by ON public.vehicle_assured USING btree (created_by);


--
-- TOC entry 5539 (class 1259 OID 17773)
-- Name: idx_va_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_va_finance_id ON public.vehicle_assured USING btree (finance_id);


--
-- TOC entry 5540 (class 1259 OID 17774)
-- Name: idx_va_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_va_vehicle_id ON public.vehicle_assured USING btree (vehicle_id);


--
-- TOC entry 5377 (class 1259 OID 16710)
-- Name: idx_vd_created_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_created_date ON public.vehicle_detail USING btree (created_date);


--
-- TOC entry 5378 (class 1259 OID 16708)
-- Name: idx_vd_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_finance_id ON public.vehicle_detail USING btree (finance_id);


--
-- TOC entry 5379 (class 1259 OID 16711)
-- Name: idx_vd_selling_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_selling_date ON public.vehicle_detail USING btree (selling_date);


--
-- TOC entry 5380 (class 1259 OID 16709)
-- Name: idx_vd_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_status ON public.vehicle_detail USING btree (status);


--
-- TOC entry 5381 (class 1259 OID 16712)
-- Name: idx_vd_vehicle_info; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_vehicle_info ON public.vehicle_detail USING btree (vehicle_info_id);


--
-- TOC entry 5382 (class 1259 OID 16713)
-- Name: idx_vd_vehicle_prefix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vd_vehicle_prefix ON public.vehicle_detail USING btree ("left"((vehicle_number)::text, 2));


--
-- TOC entry 5508 (class 1259 OID 17196)
-- Name: idx_ve_amount; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ve_amount ON public.vehicle_expenses USING btree (amount);


--
-- TOC entry 5509 (class 1259 OID 17195)
-- Name: idx_ve_expense_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ve_expense_date ON public.vehicle_expenses USING btree (expense_date);


--
-- TOC entry 5510 (class 1259 OID 17194)
-- Name: idx_ve_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ve_finance_id ON public.vehicle_expenses USING btree (finance_id);


--
-- TOC entry 5511 (class 1259 OID 17197)
-- Name: idx_ve_vehicle_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ve_vehicle_date ON public.vehicle_expenses USING btree (vehicle_id, expense_date);


--
-- TOC entry 5512 (class 1259 OID 17193)
-- Name: idx_ve_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ve_vehicle_id ON public.vehicle_expenses USING btree (vehicle_id);


--
-- TOC entry 5383 (class 1259 OID 17740)
-- Name: idx_vehicle_minimum_down_payment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicle_minimum_down_payment ON public.vehicle_detail USING btree (minimum_down_payment);


--
-- TOC entry 5368 (class 1259 OID 16664)
-- Name: idx_vi_base_price; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_base_price ON public.vehicle_info USING btree (base_price);


--
-- TOC entry 5369 (class 1259 OID 16661)
-- Name: idx_vi_body_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_body_type ON public.vehicle_info USING btree (body_type);


--
-- TOC entry 5370 (class 1259 OID 16658)
-- Name: idx_vi_brand; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_brand ON public.vehicle_info USING btree (brand);


--
-- TOC entry 5371 (class 1259 OID 16660)
-- Name: idx_vi_brand_model; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_brand_model ON public.vehicle_info USING btree (brand, model_name);


--
-- TOC entry 5372 (class 1259 OID 16662)
-- Name: idx_vi_fuel_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_fuel_type ON public.vehicle_info USING btree (fuel_type);


--
-- TOC entry 5373 (class 1259 OID 16663)
-- Name: idx_vi_make_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_make_year ON public.vehicle_info USING btree (make_year);


--
-- TOC entry 5374 (class 1259 OID 16659)
-- Name: idx_vi_model_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vi_model_name ON public.vehicle_info USING btree (model_name);


--
-- TOC entry 5515 (class 1259 OID 17362)
-- Name: idx_vm_finance_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vm_finance_id ON public.vehicle_media USING btree (finance_id);


--
-- TOC entry 5516 (class 1259 OID 17363)
-- Name: idx_vm_media_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vm_media_type ON public.vehicle_media USING btree (media_type);


--
-- TOC entry 5517 (class 1259 OID 17364)
-- Name: idx_vm_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vm_primary ON public.vehicle_media USING btree (is_primary);


--
-- TOC entry 5518 (class 1259 OID 17361)
-- Name: idx_vm_vehicle_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vm_vehicle_id ON public.vehicle_media USING btree (vehicle_id);


--
-- TOC entry 5536 (class 1259 OID 17734)
-- Name: ux_kycdocs_one_current; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_kycdocs_one_current ON public.kyc_documents USING btree (entity_type, entity_id, document_type, side) WHERE (is_current = true);


--
-- TOC entry 5577 (class 1259 OID 18128)
-- Name: ux_loanapp_converted_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_loanapp_converted_loan ON public.loan_applications USING btree (converted_loan_id) WHERE (converted_loan_id IS NOT NULL);


--
-- TOC entry 5721 (class 2620 OID 17928)
-- Name: customers trg_customers_auto_link; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_customers_auto_link AFTER INSERT OR UPDATE OF aadhar_id ON public.customers FOR EACH ROW EXECUTE FUNCTION public.fn_auto_link_mob_customer();


--
-- TOC entry 5655 (class 2606 OID 16860)
-- Name: address_history fk_address_history_address; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.address_history
    ADD CONSTRAINT fk_address_history_address FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE CASCADE;


--
-- TOC entry 5693 (class 2606 OID 18158)
-- Name: app_payment_methods fk_apm_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_payment_methods
    ADD CONSTRAINT fk_apm_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5704 (class 2606 OID 18326)
-- Name: loan_cancellations fk_cancel_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_cancellations
    ADD CONSTRAINT fk_cancel_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5705 (class 2606 OID 18321)
-- Name: loan_cancellations fk_cancel_loanapp; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_cancellations
    ADD CONSTRAINT fk_cancel_loanapp FOREIGN KEY (loan_application_id) REFERENCES public.loan_applications(id) ON DELETE CASCADE;


--
-- TOC entry 5703 (class 2606 OID 18296)
-- Name: delivery_checklist fk_checklist_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_checklist
    ADD CONSTRAINT fk_checklist_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5653 (class 2606 OID 16802)
-- Name: contacts fk_contacts_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT fk_contacts_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5654 (class 2606 OID 16807)
-- Name: contacts fk_contacts_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT fk_contacts_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5649 (class 2606 OID 16739)
-- Name: customers fk_customers_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5650 (class 2606 OID 16744)
-- Name: customers fk_customers_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicle_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5709 (class 2606 OID 18387)
-- Name: documents fk_doc_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT fk_doc_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5710 (class 2606 OID 18392)
-- Name: documents fk_doc_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT fk_doc_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5672 (class 2606 OID 17183)
-- Name: vehicle_expenses fk_expenses_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_expenses
    ADD CONSTRAINT fk_expenses_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5673 (class 2606 OID 17188)
-- Name: vehicle_expenses fk_expenses_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_expenses
    ADD CONSTRAINT fk_expenses_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicle_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5646 (class 2606 OID 16628)
-- Name: finance_detail fk_finance_owner; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_detail
    ADD CONSTRAINT fk_finance_owner FOREIGN KEY (owner_id) REFERENCES public.owner(id);


--
-- TOC entry 5662 (class 2606 OID 16988)
-- Name: godowns fk_godown_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.godowns
    ADD CONSTRAINT fk_godown_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5663 (class 2606 OID 16993)
-- Name: godowns fk_godown_owner; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.godowns
    ADD CONSTRAINT fk_godown_owner FOREIGN KEY (owner_id) REFERENCES public.owner(id) ON DELETE CASCADE;


--
-- TOC entry 5651 (class 2606 OID 16774)
-- Name: guardians fk_guardians_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT fk_guardians_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5652 (class 2606 OID 16779)
-- Name: guardians fk_guardians_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT fk_guardians_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5668 (class 2606 OID 17058)
-- Name: history_entries fk_history_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.history_entries
    ADD CONSTRAINT fk_history_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5669 (class 2606 OID 17063)
-- Name: history_entries fk_history_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.history_entries
    ADD CONSTRAINT fk_history_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5688 (class 2606 OID 18100)
-- Name: loan_applications fk_loanapp_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT fk_loanapp_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5689 (class 2606 OID 18115)
-- Name: loan_applications fk_loanapp_converted_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT fk_loanapp_converted_loan FOREIGN KEY (converted_loan_id) REFERENCES public.loans(id) ON DELETE SET NULL;


--
-- TOC entry 5690 (class 2606 OID 18110)
-- Name: loan_applications fk_loanapp_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT fk_loanapp_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5691 (class 2606 OID 18120)
-- Name: loan_applications fk_loanapp_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT fk_loanapp_payment FOREIGN KEY (payment_id) REFERENCES public.mobile_down_payment(id) ON DELETE SET NULL;


--
-- TOC entry 5692 (class 2606 OID 18105)
-- Name: loan_applications fk_loanapp_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_applications
    ADD CONSTRAINT fk_loanapp_vehicle FOREIGN KEY (vehicle_detail_id) REFERENCES public.vehicle_detail(id) ON DELETE RESTRICT;


--
-- TOC entry 5656 (class 2606 OID 16898)
-- Name: loans fk_loans_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5657 (class 2606 OID 16903)
-- Name: loans fk_loans_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT fk_loans_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5698 (class 2606 OID 18238)
-- Name: auto_debit_mandates fk_mandate_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auto_debit_mandates
    ADD CONSTRAINT fk_mandate_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5699 (class 2606 OID 18243)
-- Name: auto_debit_mandates fk_mandate_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auto_debit_mandates
    ADD CONSTRAINT fk_mandate_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5700 (class 2606 OID 18248)
-- Name: auto_debit_mandates fk_mandate_method; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auto_debit_mandates
    ADD CONSTRAINT fk_mandate_method FOREIGN KEY (payment_method_id) REFERENCES public.app_payment_methods(id) ON DELETE SET NULL;


--
-- TOC entry 5682 (class 2606 OID 18019)
-- Name: mob_customers fk_mc_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mob_customers
    ADD CONSTRAINT fk_mc_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5683 (class 2606 OID 18024)
-- Name: mob_customers fk_mc_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mob_customers
    ADD CONSTRAINT fk_mc_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5684 (class 2606 OID 18029)
-- Name: mob_customers fk_mc_finance_aadhar; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mob_customers
    ADD CONSTRAINT fk_mc_finance_aadhar FOREIGN KEY (finance_id, aadhar_id) REFERENCES public.customers(finance_id, aadhar_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5685 (class 2606 OID 18053)
-- Name: mobile_down_payment fk_mdp_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_down_payment
    ADD CONSTRAINT fk_mdp_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5686 (class 2606 OID 18058)
-- Name: mobile_down_payment fk_mdp_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_down_payment
    ADD CONSTRAINT fk_mdp_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id);


--
-- TOC entry 5687 (class 2606 OID 18129)
-- Name: mobile_down_payment fk_mdp_loanapp; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_down_payment
    ADD CONSTRAINT fk_mdp_loanapp FOREIGN KEY (loan_application_id) REFERENCES public.loan_applications(id) ON DELETE SET NULL;


--
-- TOC entry 5674 (class 2606 OID 17351)
-- Name: vehicle_media fk_media_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_media
    ADD CONSTRAINT fk_media_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE SET NULL;


--
-- TOC entry 5675 (class 2606 OID 17356)
-- Name: vehicle_media fk_media_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_media
    ADD CONSTRAINT fk_media_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicle_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5714 (class 2606 OID 18466)
-- Name: notifications fk_notif_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notif_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5713 (class 2606 OID 18442)
-- Name: notification_settings fk_notifsettings_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT fk_notifsettings_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5658 (class 2606 OID 17486)
-- Name: payments fk_payments_mobile_app_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_payments_mobile_app_payment FOREIGN KEY (mobile_app_payment_id) REFERENCES public.mobile_app_payment(id) ON DELETE SET NULL;


--
-- TOC entry 5696 (class 2606 OID 18210)
-- Name: penalties fk_penalty_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penalties
    ADD CONSTRAINT fk_penalty_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5697 (class 2606 OID 18215)
-- Name: penalties fk_penalty_settled_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penalties
    ADD CONSTRAINT fk_penalty_settled_payment FOREIGN KEY (settled_payment_id) REFERENCES public.mobile_app_payment(id) ON DELETE SET NULL;


--
-- TOC entry 5694 (class 2606 OID 18189)
-- Name: receipts fk_receipt_app_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT fk_receipt_app_payment FOREIGN KEY (app_payment_id) REFERENCES public.mobile_app_payment(id) ON DELETE CASCADE;


--
-- TOC entry 5695 (class 2606 OID 18184)
-- Name: receipts fk_receipt_down_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT fk_receipt_down_payment FOREIGN KEY (down_payment_id) REFERENCES public.mobile_down_payment(id) ON DELETE CASCADE;


--
-- TOC entry 5715 (class 2606 OID 18495)
-- Name: referrals fk_referral_referred; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT fk_referral_referred FOREIGN KEY (referred_customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE SET NULL;


--
-- TOC entry 5716 (class 2606 OID 18490)
-- Name: referrals fk_referral_referrer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5681 (class 2606 OID 17996)
-- Name: refresh_tokens fk_refresh_tokens_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5706 (class 2606 OID 18356)
-- Name: provider_reviews fk_review_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_reviews
    ADD CONSTRAINT fk_review_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5707 (class 2606 OID 18366)
-- Name: provider_reviews fk_review_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_reviews
    ADD CONSTRAINT fk_review_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5708 (class 2606 OID 18361)
-- Name: provider_reviews fk_review_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_reviews
    ADD CONSTRAINT fk_review_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5717 (class 2606 OID 18516)
-- Name: rewards_ledger fk_rewards_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rewards_ledger
    ADD CONSTRAINT fk_rewards_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5664 (class 2606 OID 17018)
-- Name: seizing_vehicle fk_seizing_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seizing_vehicle
    ADD CONSTRAINT fk_seizing_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5665 (class 2606 OID 17023)
-- Name: seizing_vehicle fk_seizing_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seizing_vehicle
    ADD CONSTRAINT fk_seizing_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5666 (class 2606 OID 17028)
-- Name: seizing_vehicle fk_seizing_godown; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seizing_vehicle
    ADD CONSTRAINT fk_seizing_godown FOREIGN KEY (godown_id) REFERENCES public.godowns(id) ON DELETE SET NULL;


--
-- TOC entry 5667 (class 2606 OID 17033)
-- Name: seizing_vehicle fk_seizing_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seizing_vehicle
    ADD CONSTRAINT fk_seizing_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicle_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5659 (class 2606 OID 16957)
-- Name: sub_due fk_subdue_customer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_due
    ADD CONSTRAINT fk_subdue_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 5660 (class 2606 OID 16962)
-- Name: sub_due fk_subdue_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_due
    ADD CONSTRAINT fk_subdue_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5661 (class 2606 OID 17495)
-- Name: sub_due fk_subdue_mobile_app_payment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sub_due
    ADD CONSTRAINT fk_subdue_mobile_app_payment FOREIGN KEY (mobile_app_payment_id) REFERENCES public.mobile_app_payment(id) ON DELETE SET NULL;


--
-- TOC entry 5701 (class 2606 OID 18275)
-- Name: loan_terms_agreements fk_terms_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_terms_agreements
    ADD CONSTRAINT fk_terms_loan FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- TOC entry 5702 (class 2606 OID 18270)
-- Name: loan_terms_agreements fk_terms_loanapp; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_terms_agreements
    ADD CONSTRAINT fk_terms_loanapp FOREIGN KEY (loan_application_id) REFERENCES public.loan_applications(id) ON DELETE CASCADE;


--
-- TOC entry 5718 (class 2606 OID 18540)
-- Name: support_tickets fk_ticket_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT fk_ticket_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5719 (class 2606 OID 18545)
-- Name: support_tickets fk_ticket_staff; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT fk_ticket_staff FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 5671 (class 2606 OID 17156)
-- Name: users_details fk_users_details_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_details
    ADD CONSTRAINT fk_users_details_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5678 (class 2606 OID 17768)
-- Name: vehicle_assured fk_vehicle_assured_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_assured
    ADD CONSTRAINT fk_vehicle_assured_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 5679 (class 2606 OID 17758)
-- Name: vehicle_assured fk_vehicle_assured_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_assured
    ADD CONSTRAINT fk_vehicle_assured_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5680 (class 2606 OID 17763)
-- Name: vehicle_assured fk_vehicle_assured_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_assured
    ADD CONSTRAINT fk_vehicle_assured_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicle_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5647 (class 2606 OID 16698)
-- Name: vehicle_detail fk_vehicle_finance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT fk_vehicle_finance FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id);


--
-- TOC entry 5648 (class 2606 OID 16703)
-- Name: vehicle_detail fk_vehicle_info; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicle_detail
    ADD CONSTRAINT fk_vehicle_info FOREIGN KEY (vehicle_info_id) REFERENCES public.vehicle_info(id) ON DELETE SET NULL;


--
-- TOC entry 5711 (class 2606 OID 18412)
-- Name: wishlist fk_wishlist_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT fk_wishlist_account FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5712 (class 2606 OID 18417)
-- Name: wishlist fk_wishlist_vehicle; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT fk_wishlist_vehicle FOREIGN KEY (vehicle_detail_id) REFERENCES public.vehicle_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5676 (class 2606 OID 17472)
-- Name: mobile_app_payment mobile_app_payment_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_app_payment
    ADD CONSTRAINT mobile_app_payment_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- TOC entry 5677 (class 2606 OID 17477)
-- Name: mobile_app_payment mobile_app_payment_finance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mobile_app_payment
    ADD CONSTRAINT mobile_app_payment_finance_id_fkey FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id);


--
-- TOC entry 5670 (class 2606 OID 17095)
-- Name: office_expenses office_expenses_ibfk_1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.office_expenses
    ADD CONSTRAINT office_expenses_ibfk_1 FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


--
-- TOC entry 5720 (class 2606 OID 33537)
-- Name: recent_activity recent_activity_finance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recent_activity
    ADD CONSTRAINT recent_activity_finance_id_fkey FOREIGN KEY (finance_id) REFERENCES public.finance_detail(id) ON DELETE CASCADE;


-- Completed on 2026-09-08 13:40:35

--
-- PostgreSQL database dump complete
--

\unrestrict o5Mx7KbSYwFlEQfuF5k5ezxU6G47RiG8M5srDy9UAozCFlawdRaZMwbOV4EfZgz

