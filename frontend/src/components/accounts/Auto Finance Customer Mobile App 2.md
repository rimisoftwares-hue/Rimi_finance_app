# Rimi Finance – Customer Mobile App
## Requirements & Architecture Structure (v2 — with production-grade additions)

> Auto finance app for customers — bike/vehicle buying + loan/EMI management + payments, DriveX-style catalog, with unpaid-customer location tracking.

---

## 1. Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| Mobile App | **React Native** (Expo managed workflow to start) | Single codebase for Android + iOS, faster budget-friendly build |
| Web (if needed later) | React + TypeScript (reuse component logic) | Keeps parity with your existing Rimi Finance React/TS frontend |
| Backend | **Node.js + Express.js** | Matches your existing Rimi Finance backend — one team, one stack |
| Database | **MySQL 8 on AWS RDS** | See reasoning below |
| Cache / Realtime | **Redis** + **Socket.io** | Redis for OTP cache, session, geo-clustering (`GEOADD`/`GEORADIUS`); Socket.io for live location push to an admin/recovery dashboard |
| File Storage | **AWS S3** + CloudFront CDN | Vehicle images, RC/insurance docs, profile photos, receipts — budget-friendly, scales well |
| Auth (OTP SMS) | MSG91 / 2Factor.in (India-focused, cheaper than Twilio) | JWT access token (short-lived) + refresh token (rotated, stored hashed) |
| Payments | **Razorpay** or **Cashfree** | Supports UPI/QR, cards, e-NACH/auto-debit for EMI, webhooks, reconciliation reports |
| Push/SMS/WhatsApp | FCM (push), MSG91 (SMS), Gupshup/Interakt (WhatsApp), SES (email) | Standard India-friendly notification stack |
| Background Jobs | `node-cron` + **BullMQ** (Redis-backed queues) | EMI reminders, penalty calc, location dwell-time analysis, reconciliation |
| Hosting (budget start) | EC2 (t3.small) or Elastic Beanstalk + RDS `db.t3.micro` + S3 | Scale to ECS/RDS Multi-AZ later when traffic grows |



## 2. Mobile App — Screens & Features Checklist

### A. Auth & Onboarding
- [ ] Splash / landing screen
- [ ] Mobile number entry
- [ ] OTP verification (JWT + refresh token issued on success)
- [ ] Existing customer → auto-fetch `finance_id` → load their finance dashboard directly
- [ ] New customer → profile form (name, address, guardian details) with **Skip** option
- [ ] Device/session management (view & log out other active sessions, active devices list)
- [ ] Biometric/PIN app-lock (optional, nice-to-have)
- [ ] Suspicious login detection + login history (new device/location alert)

### B. Home / Dashboard (DriveX-style)
- [ ] Browse all vehicles (filter: brand, price, fuel type, transmission)
- [ ] Vehicle detail page:
  - [ ] RC book details, chassis no., engine no., KM driven
  - [ ] Fuel type, transmission, ownership (1st/2nd owner)
  - [ ] Insurance validity, pollution certificate validity
  - [ ] Service history, accident history, condition report
  - [ ] RTO details
  - [ ] Document uploads (view)
  - [ ] Image gallery + video, optional 360° view
  - [ ] **Bike inspection report**
  - [ ] **Accessories included**
  - [ ] **Spare key available**
  - [ ] **Original documents available**
  - [ ] **Finance eligibility badge** ("Eligible for finance")
  - [ ] **"EMI starts from ₹XXXX"** teaser on listing card
  - [ ] **Vehicle availability status** (Available / Booked / Sold)
- [ ] Compare multiple vehicles side-by-side
- [ ] Wishlist (add/remove)
- [ ] Recently viewed
- [ ] Recommended vehicles (based on browsing/loan eligibility)
- [ ] **Similar vehicles** (on detail page)
- [ ] **Recently sold vehicles** (social proof section)
- [ ] Seller/dealer rating & vehicle reviews
- [ ] Report fake listing
- [ ] Search with debounced filters, infinite scroll, skeleton loading
  - [ ] **Voice search**
  - [ ] **Save filter presets**
  - [ ] **Recent searches**
  - [ ] **Trending searches**
  - [ ] **Popular bikes** shelf

### D. Finance Module
- [ ] EMI calculator (down payment, tenure, interest rate → live EMI preview)
- [ ] Loan application form → tied to selected vehicle
- [ ] Finance approval status tracker
- [ ] Loan summary: amount, interest rate, tenure, processing fee, total payable
- [ ] EMI schedule (table/calendar view)
  - [ ] **Next EMI countdown**
  - [ ] **Upcoming EMI calendar view**
  - [ ] **Pay multiple EMIs at once**
  - [ ] **Advance EMI payment**
  - [ ] **Pending / Paid / Missed EMI filters**
  - [ ] **Loan closure progress bar**, e.g.:
    ```
    Loan Progress
    ██████████░░░░
    18 / 24 EMI Paid
    Remaining ₹52,000
    ```
- [ ] Foreclosure amount calculator
  - [ ] **Interest saved by foreclosure** (shown alongside calculator)
- [ ] Part-payment request
- [ ] Penalty breakdown (if overdue)
  - [ ] **Penalty forecast** (projected penalty if EMI stays unpaid)
- [ ] Auto EMI due reminder banner
- [ ] **Loan eligibility screen** — "Eligible Loan: ₹3,20,000" (based on internal credit score model)
- [ ] **Internal credit score** display (non-CIBIL, in-house risk score)
- [ ] **Risk level** indicator (Low/Medium/High — internal/admin-facing, optionally surfaced to customer in simplified form)
- [ ] **Loan history** — previous loans, current active loan(s), closed loans

### E. Payment Module
- [ ] Pay EMI — choose method: **UPI/QR, Card, Auto-debit (e-mandate)**
  - [ ] **Saved UPI IDs**
  - [ ] **Saved cards** (gateway tokenization — never store raw card data)
  - [ ] **QR regeneration** (expired QR refresh)
- [ ] Partial payment
- [ ] Advance booking payment
- [ ] Payment retry on failure
  - [ ] **Auto retry** (scheduled retry on saved payment method after failure)
  - [ ] **Payment pending state** (distinct from success/failed — for async UPI/e-NACH confirmations)
  - [ ] **Settlement status** (gateway settled vs. pending)
- [ ] Refund status tracking
- [ ] Payment receipt (PDF, downloadable/shareable)
  - [ ] **Share receipt** (WhatsApp/email share sheet)
  - [ ] **GST invoice** generation (where applicable)
- [ ] Invoice generation
- [ ] Full payment history
- [ ] Failed payment log (customer-visible + admin-visible)

### F. Order / Booking Management
- [ ] Booking status tracker (applied → doc verification → finance approved → delivery)
- [ ] Document verification status
- [ ] Booking timeline (visual stepper)
- [ ] Cancellation request
- [ ] Refund status
- [ ] **Appointment booking** (visit dealership)
- [ ] **Delivery date scheduling**
- [ ] **Vehicle pickup slot** selection
- [ ] **Dealer contact** details on booking screen
- [ ] **Delivery OTP** (verify handover)
- [ ] **Delivery checklist** (accessories, documents, spare key confirmation at handover)
- [ ] **Digital signature** capture (loan agreement / delivery acknowledgment)

### G. Customer Profile
- [ ] Profile photo + personal details
- [ ] Address (with map pin)
- [ ] Guardian/co-applicant details
- [ ] Vehicle details (owned/financed)
- [ ] Loan details
- [ ] Payment/due history
- [ ] Bike servicing history
- [ ] Penalty amount log
- [ ] Servicing & servicing-amount history
- [ ] **Occupation**
- [ ] **PAN** (optional)
- [ ] **Aadhaar**
- [ ] **Bank account details**
- [ ] **Preferred language**
- [ ] **Communication preference** (SMS/WhatsApp/Email/Push — opt-in per channel)
- [ ] **Notification settings**
- [ ] **Delete account request** (with DPDP-compliant data deletion workflow)

### H. Notifications → Notification Center
Instead of a flat notification list, build a proper **Notification Center** with tabs/filters:
```
Payment | Finance | Offers | System | Booking | Documents
```
- [ ] Push notifications (FCM)
- [ ] SMS alerts
- [ ] WhatsApp alerts
- [ ] Email notifications
- [ ] EMI due reminders
- [ ] Booking status updates
- [ ] Payment confirmation
- [ ] Offer/promo notifications
- [ ] **Read / Unread state**
- [ ] **Mark all as read**
- [ ] **Delete notification**
- [ ] **Archive notification**

### I. Maps & Location (customer-facing)
- [ ] Auto-detect current location
- [ ] Google Maps integration
- [ ] Nearby dealer/vehicle locator
- [ ] Distance calculation
- [ ] Route navigation to dealership

### J. Reviews
- [ ] Rate seller/dealer
- [ ] Rate vehicle
- [ ] Leave feedback
- [ ] Report fake listing

### K. Digital Documents (new)
Self-serve document center — customer can view/download without contacting support:
- [ ] Loan agreement PDF
- [ ] Digital EMI card
- [ ] NOC download
- [ ] Foreclosure certificate
- [ ] No Due Certificate
- [ ] Payment certificate
- [ ] Insurance copy
- [ ] RC copy
- [ ] Hypothecation removal letter

### L. Customer Support (new)
- [ ] Raise complaint
- [ ] Ticket system (with status tracking)
- [ ] Live chat
- [ ] WhatsApp support
- [ ] Call finance office (click-to-call)
- [ ] FAQ
- [ ] Knowledge base

### M. Customer Analytics Dashboard (new)
A simple visual summary on the finance home screen:
```
Total Paid        ₹2,30,000
Pending            ₹58,000
Penalty                 ₹0
Completed EMI          18/24
Remaining                6
```
- [ ] Monthly payment chart
- [ ] Payment history graph

### N. Offline Support (new)
- [ ] Offline login (cached session)
- [ ] Cached vehicle list
- [ ] Cached loan summary
- [ ] Background sync when internet returns

### O. Vehicle Service & Renewal Reminders (extends existing servicing history)
- [ ] Next service reminder
- [ ] Insurance renewal reminder
- [ ] Pollution (PUC) renewal reminder
- [ ] RC renewal reminder
- [ ] Service booking
- [ ] Nearby service center locator

### P. Settings (new)
```
Language | Dark Mode | Notifications | Privacy | Terms | About | App Version | Clear Cache | Logout
```

### Q. Referral & Rewards (new, future)
- [ ] Invite friend
- [ ] Referral bonus
- [ ] Cashback
- [ ] Coupon
- [ ] Wallet credit
- [ ] Reward points for on-time EMI payment → redeemable; points reduced on late payment

### R. Digital Wallet (new, future)
- [ ] Wallet balance
- [ ] Refund wallet
- [ ] Cashback wallet
- [ ] Advance balance
- [ ] Wallet transaction history

### S. AI Loan Assistant (new, future/optional)
LLM-based chatbot for natural-language finance queries, e.g.:
- "Can I pay next month's EMI early?"
- "How much penalty do I owe?"
- "Can I foreclose my loan now?"
- "Show bikes under ₹80,000"

Can be integrated later without disrupting core architecture — treat as a thin service layer that calls existing `/finance`, `/payments`, `/vehicles` APIs.

### T. Dealer Module (new, future — separate login)
Dealer-side app/portal:
- [ ] Upload vehicles
- [ ] Manage stock
- [ ] View bookings
- [ ] Upload RC
- [ ] Upload insurance
- [ ] Upload images

---

## 3. Backend Architecture

### Domain modules (mirroring your existing Rimi Finance domain-driven structure)
```
/src
  /auth            → OTP, JWT, refresh token, session mgmt
  /customers       → profile, address, guardian, KYC docs
  /vehicles        → catalog, images, RC/RTO details
  /finance         → loans, EMI schedule, foreclosure, penalty, eligibility, credit score
  /payments        → gateway integration, webhooks, reconciliation
  /orders          → booking lifecycle, cancellations, refunds
  /location        → location pings, dwell-time & hotspot detection, recovery integration
  /notifications   → push/SMS/WhatsApp/email dispatch, notification center
  /reviews         → ratings & feedback
  /documents       → digital document generation/storage (agreement, NOC, certificates)
  /kyc             → PAN/Aadhaar/DL verification workflows
  /support         → tickets, live chat, complaint handling
  /dealer          → dealer accounts, stock, bookings
  /wallet          → wallet, cashback, refund balances
  /rewards         → reward points engine
  /coupons         → coupon management
  /referrals       → referral program
  /banners         → banner/announcement management
  /settings        → app-level user settings
  /search          → search, trending, recent, saved filters
  /analytics       → customer + admin dashboards, reports
  /audit           → audit trail across all modules
  /version         → app version check, force update, maintenance mode
  /feature-flags   → feature flag service (gradual rollout)
  /health          → health/readiness checks
  /monitoring      → metrics, tracing hooks
  /backup          → backup orchestration hooks
  /scheduler       → cron/BullMQ job registry
  /storage         → S3 upload/compression helpers
```

### Core DB tables (high level — normalize further as needed)
- `customers`, `customer_addresses`, `customer_guardians`, `customer_documents`
- `vehicles`, `vehicle_images`, `vehicle_documents`, `vehicle_service_history`
- `loans`, `loan_emi_schedule`, `loan_penalties`, `loan_foreclosures`, `loan_eligibility_scores`
- `payments`, `payment_webhooks_log`, `payment_receipts`, `saved_payment_methods`
- `bookings`, `booking_status_history`, `booking_delivery_checklist`
- `wishlist`, `vehicle_comparisons`, `recently_viewed`
- `reviews`
- `location_pings`, `customer_frequent_locations`, `location_flags`, `recovery_visits`
- `notifications_log`
- `documents_generated` (agreement/NOC/certificates)
- `support_tickets`, `support_ticket_messages`
- `wallet_balances`, `wallet_transactions`
- `reward_points_log`
- `coupons`, `referrals`
- `banners`, `announcements`
- `feature_flags`
- `audit_logs` (soft delete flags + audit trail across all above)

---

### 3.1 Auth Flow
1. Customer enters mobile number → backend checks `customers` table.
2. **Existing customer** → OTP sent → verified → JWT + refresh token issued → `finance_id` attached to session → app loads their dashboard directly.
3. **New customer** → OTP verified → profile form shown (address + guardian details, **Skip allowed**) → customer record created without a `finance_id` yet (assigned once they apply for a loan).

### 3.2 Location Tracking (Unpaid/Overdue Customers) — detailed design
This is the most specialized piece, so breaking it down per your 3 points:

**i) Payment-time location capture**
- On every payment attempt (success or fail), client sends `{lat, long, accuracy, timestamp}` alongside the payment event.
- Stored in `location_pings` with `event_type = 'payment'`, linked to `payment_id`.

**ii) Periodic tracking for overdue customers**
- Only customers flagged **overdue** (via `loans.status`) get background location polling — every 5 minutes while app is active (respect OS background limits + get explicit consent — see note below).
- Each ping → `location_pings` (customer_id, lat, long, timestamp).
- A cron job (BullMQ, runs every 15–30 min) scans recent pings per customer, clusters consecutive pings within a small radius (e.g. 100m) using Redis `GEOADD`/`GEORADIUS` or MySQL `ST_Distance_Sphere`.
- If a cluster's duration **exceeds 4 hours**, insert/update a row in `location_flags` with `importance = 'high'` — this is likely their home/workplace, useful for recovery visits.

**iii) Most-frequent-location detection**
- Daily aggregation job groups all pings per customer over a rolling 30-day window, geo-hashes coordinates to a grid cell, and ranks by total visit count + total hours spent.
- Top cluster written to `customer_frequent_locations` (customer_id, lat, long, visit_count, total_hours_spent, last_seen_at).
- Admin/recovery dashboard (via Socket.io) can see this ranked list + live location if the customer is currently active.

**iv) Recovery team dashboard fields (extends the above for the recovery/admin side)**
- Last seen (timestamp + location)
- Live status (online/last-active)
- Frequent route (derived from ping history)
- Home location / work location (from clustering)
- Visit history (recovery team's past visits, logged manually)
- Recovery notes (free-text per visit)
- Recovery status (assigned / in-progress / resolved)
- Recovery assignment (which agent is handling the case)
- Recovery photo upload (proof of visit)

**Important note:** location tracking of this kind — including all recovery-team fields above — must be gated behind explicit customer consent captured at loan agreement time, restricted to genuinely overdue accounts, access-controlled (RBAC — only recovery/admin roles), and should follow India's data protection norms (DPDP Act) for storage/retention limits.

### 3.3 Payment Flow
1. Customer picks method (UPI/QR, card, auto-debit) → request sent to gateway (Razorpay/Cashfree).
2. Gateway redirects/returns → **webhook** hits backend → signature verified.
3. In a single DB transaction: update `payments`, update `loan_emi_schedule` (mark EMI paid), update the linked **finance ledger account** (this connects into your existing Rimi Finance accounting module — post a voucher entry against the customer's ledger).
4. Generate PDF receipt → store in S3 → trigger payment-confirmation notification.
5. Nightly reconciliation job cross-checks gateway settlement report vs internal `payments` table, flags mismatches.
6. **Idempotency key** required on every payment-initiation request to prevent duplicate charges on retry/network failure.

### 3.4 Vehicle Catalog / Booking Flow
1. Vehicle listed with full spec + documents + images (S3, compressed via `sharp` on upload).
2. Customer browses/wishlists/compares → applies for finance on a chosen vehicle.
3. Booking created → document verification → finance approval → delivery — each stage updates `booking_status_history` and fires a notification.

### 3.5 Admin / Backend-Only Modules (support the customer app)
Hidden APIs consumed by the app but managed from an admin panel — lets you ship feature changes without an app release:
- Version check / Force update / Maintenance mode
- Feature flags (per-user or percentage rollout)
- Banner API / Announcement API
- Broadcast notification
- Coupon management
- Referral management
- Cashback management
- Finance offers management
- Vehicle recommendation engine (tuning)
- Customer segmentation
- Audit dashboard

---

## 4. Non-Functional / Infra Checklist

**Backend requirements**
- [ ] Relational schema with proper foreign keys & constraints
- [ ] DB transactions for payment + ledger updates
- [ ] Audit logs (who changed what, when) — comprehensive audit trail for all financial operations
- [ ] S3 file storage + image compression on upload
- [ ] API rate limiting (e.g. `express-rate-limit`, or **Redis-backed rate limiting per user/device** for finer control)
- [ ] Input validation (`zod`/`joi`)
- [ ] Centralized error logging (Winston/Pino → CloudWatch)
- [ ] Automated RDS backups + point-in-time recovery
- [ ] **Idempotency keys** for all payment APIs (duplicate payment avoidance)
- [ ] **Distributed request tracing** (OpenTelemetry)
- [ ] **API versioning** (`/api/v1`, `/api/v2`)
- [ ] **OpenAPI/Swagger documentation**
- [ ] **Secrets management** (AWS Secrets Manager)
- [ ] **Database migration tooling**
- [ ] **Read replica support** for heavy reporting/analytics queries
- [ ] **Feature flags with gradual rollout**
- [ ] **Health checks** (`/health`, `/ready`)
- [ ] **Disaster recovery plan** with RTO/RPO targets
- [ ] **Monitoring dashboards** (CPU, DB, queue depth, payment failure rate)
- [ ] **Automated fraud rules** — multiple failed payment attempts, unusual device/location changes trigger review

**Security (finance-grade)**
- [ ] Refresh token rotation (already planned) — enforce rotation + revoke-on-reuse detection
- [ ] Device binding (tie session to device fingerprint)
- [ ] Jailbreak/root detection
- [ ] SSL pinning / certificate pinning
- [ ] Secure storage (Expo SecureStore / Keychain / Keystore) for tokens and sensitive local data
- [ ] API request signing (HMAC) for critical endpoints (payments, profile changes)
- [ ] Session timeout + force logout (remote, from admin panel)
- [ ] Suspicious login detection + login history + active devices list

**Performance**
- [ ] Lazy loading, infinite scroll on catalog
- [ ] Image optimization + CDN
- [ ] Pagination on all list APIs
- [ ] Skeleton loading states
- [ ] Offline cache (PWA/RN offline support)
- [ ] Debounced search/filters

**UX**
- [ ] Dark/Light mode
- [ ] Responsive layouts
- [ ] Loading/empty/error states everywhere
- [ ] Toast notifications + confirmation dialogs
- [ ] Tamil + English multi-language support
- [ ] Accessibility (screen reader labels, contrast)

---

## 5. Suggested Build Phases

1. **Phase 1** — Auth (OTP+JWT + device/session mgmt), customer profile (incl. KYC fields), vehicle catalog (read-only, incl. search/voice search/filters)
2. **Phase 2** — Finance module (EMI calculator, loan application, eligibility/credit score, EMI progress + filters), Payment module (Razorpay/Cashfree integration + ledger sync, saved methods, receipts/GST invoice), Digital Documents center
3. **Phase 3** — Order/booking lifecycle (incl. delivery checklist/OTP/e-signature), wishlist/compare, Notification Center, Customer Support (tickets/chat), Analytics dashboard, Offline support
4. **Phase 4** — Location tracking (overdue customers) + Recovery dashboard, Security hardening (device binding, root detection, cert pinning), Settings, Admin integration (feature flags/version control/banners)
5. **Phase 5 (future)** — Referral & Rewards, Digital Wallet, Vehicle service/renewal reminders, Dealer Module, AI Loan Assistant, Enterprise NFRs (tracing, DR plan, fraud rules, read replicas)