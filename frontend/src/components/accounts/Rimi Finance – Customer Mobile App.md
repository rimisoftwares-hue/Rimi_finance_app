# Rimi Finance – Customer Mobile App
## Requirements Checklist & Architecture Structure

> Auto finance app for customers — bike/vehicle buying + loan/EMI management + payments, DriveX-style catalog, with unpaid-customer location tracking.

---

## 1. Recommended Tech Stack

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

### MySQL vs PostgreSQL — my recommendation: **MySQL**
- Your existing Rimi Finance ledger/accounting backend is already MySQL — keeping one DB engine means one connection pool, one ops skill set, one backup strategy, and you can potentially share `finance_id` / customer tables directly instead of syncing across two databases.
- The one place Postgres would normally win is geospatial (PostGIS) for the location-clustering feature. But MySQL 8 has `ST_Distance_Sphere()`, spatial indexes (`SPATIAL INDEX`), and `POINT` data types built in — enough for radius/dwell-time clustering at your scale. Redis Geo commands can also carry the heavy real-time clustering load, keeping MySQL simple.
- **Only switch to Postgres** if you expect very heavy geospatial querying (thousands of concurrent live-tracked customers) down the line — otherwise MySQL keeps things simpler and cheaper for now.

---

## 2. Mobile App — Screens & Features Checklist

### A. Auth & Onboarding
- [ ] Splash / landing screen
- [ ] Mobile number entry
- [ ] OTP verification (JWT + refresh token issued on success)
- [ ] Existing customer → auto-fetch `finance_id` → load their finance dashboard directly
- [ ] New customer → profile form (name, address, guardian details) with **Skip** option
- [ ] Device/session management (view & log out other active sessions)
- [ ] Biometric/PIN app-lock (optional, nice-to-have)

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
- [ ] Compare multiple vehicles side-by-side
- [ ] Wishlist (add/remove)
- [ ] Recently viewed
- [ ] Recommended vehicles (based on browsing/loan eligibility)
- [ ] Seller/dealer rating & vehicle reviews
- [ ] Report fake listing
- [ ] Search with debounced filters, infinite scroll, skeleton loading

### D. Finance Module
- [ ] EMI calculator (down payment, tenure, interest rate → live EMI preview)
- [ ] Loan application form → tied to selected vehicle
- [ ] Finance approval status tracker
- [ ] Loan summary: amount, interest rate, tenure, processing fee, total payable
- [ ] EMI schedule (table/calendar view)
- [ ] Foreclosure amount calculator
- [ ] Part-payment request
- [ ] Penalty breakdown (if overdue)
- [ ] Auto EMI due reminder banner

### E. Payment Module
- [ ] Pay EMI — choose method: **UPI/QR, Card, Auto-debit (e-mandate)**
- [ ] Partial payment
- [ ] Advance booking payment
- [ ] Payment retry on failure
- [ ] Refund status tracking
- [ ] Payment receipt (PDF, downloadable/shareable)
- [ ] Invoice generation
- [ ] Full payment history
- [ ] Failed payment log (customer-visible + admin-visible)

### F. Order / Booking Management
- [ ] Booking status tracker (applied → doc verification → finance approved → delivery)
- [ ] Document verification status
- [ ] Booking timeline (visual stepper)
- [ ] Cancellation request
- [ ] Refund status

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

### H. Notifications
- [ ] Push notifications (FCM)
- [ ] SMS alerts
- [ ] WhatsApp alerts
- [ ] Email notifications
- [ ] EMI due reminders
- [ ] Booking status updates
- [ ] Payment confirmation
- [ ] Offer/promo notifications

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

---

## 3. Backend Architecture

### Domain modules (mirroring your existing Rimi Finance domain-driven structure)
```
/src
  /auth            → OTP, JWT, refresh token, session mgmt
  /customers       → profile, address, guardian, KYC docs
  /vehicles        → catalog, images, RC/RTO details
  /finance         → loans, EMI schedule, foreclosure, penalty
  /payments        → gateway integration, webhooks, reconciliation
  /orders          → booking lifecycle, cancellations, refunds
  /location        → location pings, dwell-time & hotspot detection
  /notifications   → push/SMS/WhatsApp/email dispatch
  /reviews         → ratings & feedback
```

### Core DB tables (high level — normalize further as needed)
- `customers`, `customer_addresses`, `customer_guardians`, `customer_documents`
- `vehicles`, `vehicle_images`, `vehicle_documents`, `vehicle_service_history`
- `loans`, `loan_emi_schedule`, `loan_penalties`, `loan_foreclosures`
- `payments`, `payment_webhooks_log`, `payment_receipts`
- `bookings`, `booking_status_history`
- `wishlist`, `vehicle_comparisons`, `recently_viewed`
- `reviews`
- `location_pings`, `customer_frequent_locations`, `location_flags`
- `notifications_log`
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

**Important note:** location tracking of this kind should be gated behind explicit customer consent captured at loan agreement time, restricted to genuinely overdue accounts, access-controlled (RBAC — only recovery/admin roles), and should follow India's data protection norms (DPDP Act) for storage/retention limits.

### 3.3 Payment Flow
1. Customer picks method (UPI/QR, card, auto-debit) → request sent to gateway (Razorpay/Cashfree).
2. Gateway redirects/returns → **webhook** hits backend → signature verified.
3. In a single DB transaction: update `payments`, update `loan_emi_schedule` (mark EMI paid), update the linked **finance ledger account** (this connects into your existing Rimi Finance accounting module — post a voucher entry against the customer's ledger).
4. Generate PDF receipt → store in S3 → trigger payment-confirmation notification.
5. Nightly reconciliation job cross-checks gateway settlement report vs internal `payments` table, flags mismatches.

### 3.4 Vehicle Catalog / Booking Flow
1. Vehicle listed with full spec + documents + images (S3, compressed via `sharp` on upload).
2. Customer browses/wishlists/compares → applies for finance on a chosen vehicle.
3. Booking created → document verification → finance approval → delivery — each stage updates `booking_status_history` and fires a notification.

---

## 4. Non-Functional / Infra Checklist

**Backend requirements**
- [ ] Relational schema with proper foreign keys & constraints
- [ ] DB transactions for payment + ledger updates
- [ ] Soft delete on customer/vehicle/loan records
- [ ] Audit logs (who changed what, when)
- [ ] S3 file storage + image compression on upload
- [ ] API rate limiting (e.g. `express-rate-limit`)
- [ ] Input validation (`zod`/`joi`)
- [ ] Centralized error logging (Winston/Pino → CloudWatch)
- [ ] Automated RDS backups + point-in-time recovery

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

1. **Phase 1** — Auth (OTP+JWT), customer profile, vehicle catalog (read-only)
2. **Phase 2** — Finance module (EMI calculator, loan application), Payment module (Razorpay/Cashfree integration + ledger sync)
3. **Phase 3** — Order/booking lifecycle, wishlist/compare, notifications
4. **Phase 4** — Location tracking (overdue customers), analytics/admin dashboard, reviews, polish/multi-language