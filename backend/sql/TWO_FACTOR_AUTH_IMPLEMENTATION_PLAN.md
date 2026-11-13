# Two-Factor Authentication (2FA) & Step-Up Security: Master Implementation Plan
(WhatsApp Business Cloud API OTP + RFC 6238 Authenticator App TOTP + Backup Codes + Google-Style Step-Up Re-Auth & Account Recovery)

> **For Engineering / AI Execution:** Follow the **6 Phases** sequentially (`Database Migration -> Crypto & TOTP Engine -> WhatsApp Cloud API Provider -> Backend Step-Up, Login & Recovery Routes -> Frontend Reusable Step-Up & Profile/Auth Flows -> Owner Admin Controls & E2E Verification`). After each phase, run that phase's verification commands and do not proceed until all checks pass.

**Goal:** Implement production-grade Two-Factor Authentication (WhatsApp OTP + QR-based Authenticator App TOTP + Recovery Backup Codes) and Google-style Step-Up Verification across Password Change, Sensitive Identity Updates (Username, Phone, Email, 2FA Settings), User Login, and Forgot Password Recovery, with Owner emergency 2FA reset in Agent Management.

**Architecture:** Normalized principal-scoped PostgreSQL tables (`principal_type IN ('user', 'owner')`, `principal_id UUID`), AES-256-GCM encryption at rest for TOTP secrets, HMAC-SHA256 hashing for OTP challenges and backup codes, RFC 6238 TOTP with replay prevention (`last_used_totp_step`), dedicated JWT secret (`TWO_FACTOR_CHALLENGE_SECRET`) + single-use DB-tracked `jti` (`auth_step_up_grants`) for step-up and password-reset grants, and official Meta WhatsApp Cloud API (`v21.0` Authentication Template) delivery.

**Tech Stack:** Node.js (CommonJS) + Express + PostgreSQL 18 (`uuidv7()`), Node built-in `crypto` (AES-256-GCM, HMAC-SHA1/SHA256, CSPRNG, `timingSafeEqual`), `qrcode` (pure-JS QR SVG/DataURL), React 18 + TypeScript + Vite + `input-otp` + Radix Dialog + Tailwind CSS.

---

## 0. SCOPE, SECURITY INVARIANTS & ENVIRONMENT VARIABLES

### 0.1 Explicit User Scope & Non-Goals
1. **Two 2FA Channels + Backup Recovery**:
   - **Channel 1 — WhatsApp OTP (`whatsapp_otp`)**: Sends a 6-digit numeric OTP to the user's registered mobile number (`users.phone_no` normalized to E.164, e.g., `919876543210`) via Meta WhatsApp Business Cloud API (`Authentication` category template).
   - **Channel 2 — Authenticator App (`totp`)**: User scans a QR code (`otpauth://totp/AutoFinex:...`) in Google Authenticator, Microsoft Authenticator, Authy, or 1Password, confirms a 6-digit code once to activate, and uses rolling 30-second codes thereafter.
   - **Backup Codes (`backup_code`)**: 8 single-use 8-character alphanumeric recovery codes generated upon TOTP enrollment (and regeneratable with Step-Up 2FA).
2. **Google-Style Trigger Points**:
   - **Change Password** (`UserProfile.tsx` -> `ChangePasswordDialog.tsx`): Requires `Current Password` + **Step-Up 2FA** (`totp` or `whatsapp_otp` or `backup_code`).
   - **Sensitive Profile / Identity Changes** (`UserProfile.tsx` -> `EditAccountIdentityDialog.tsx` & `TwoFactorSettingsDialog.tsx`):
     - Changing **Username** (`username`) -> `Current Password` + **Step-Up 2FA**.
     - Changing **Email** (`email`) -> `Current Password` + **Step-Up 2FA**.
     - Changing **Mobile Phone** (`phone_no`) -> `Current Password` + **Step-Up 2FA on current factor** + **WhatsApp OTP verification on the NEW mobile number** before committing.
     - Enabling / Disabling **Authenticator App** or **Login 2FA** or Regenerating **Backup Codes** -> `Current Password` + **Step-Up 2FA**.
   - **User Login (`UserLogin.tsx`)**: When a user has Login 2FA / Authenticator enabled, password verification returns a short-lived `preAuthToken` (5 min) and prompts 2-Step Verification (`totp` default if enrolled, with `"Try another way"` switcher for `whatsapp_otp` or `backup_code`) before creating `agent_login_sessions` and issuing the session JWT.
   - **Forgot Password (`ForgotPassword.tsx` linked from `UserLogin.tsx`)**:
     - Replaces the legacy broken email-reset stub in `auth.routes.js` (which queried a removed `users.role` column and leaked `resetLink` in HTTP JSON).
     - Uses **WhatsApp OTP to registered mobile** + (if `totp_enabled = true` on the account) **Authenticator TOTP or Backup Code** so WhatsApp access alone can never bypass an active Authenticator App.
   - **Agent Management (`AgentManagement.tsx` & `UserDetailModal.tsx`)**:
     - Displays each user's 2FA enrollment badge (`Authenticator + WhatsApp`, `WhatsApp OTP`, `Disabled`).
     - Provides an **Owner-Only Emergency 2FA Reset** action (for staff who lost their phone and backup codes), gated by Owner password re-verification and recorded in `auth_security_audit_log`.
3. **Explicit Non-Goal (Per User Instruction)**:
   - Account lockout / CAPTCHA on multiple wrong password attempts during standard login is **excluded** for now (*"மல்டிபிள் டைம் அவங்க தப்பா லாகின் பண்றாங்க அப்படின்னம்னா சப்போஸ் அதுக்கு அது இப்போதைக்கு தேவையில்லை"*). However, **OTP / TOTP / Step-Up verification endpoints MUST enforce strict per-challenge attempt caps (`max_attempts = 5`) and rate limits** so 6-digit codes can never be brute-forced.

### 0.2 Non-Negotiable Security Invariants
- **S1 — Encrypt TOTP Secrets at Rest**: Never store Base32 TOTP secrets in plaintext. Encrypt with `AES-256-GCM` using 32-byte `TWO_FACTOR_ENCRYPTION_KEY` (`v1:<12B_iv_hex>:<16B_authTag_hex>:<ciphertext_hex>`).
- **S2 — Hash All OTPs & Backup Codes**: Never store 6-digit WhatsApp OTPs or 8-char backup codes in plaintext. Store `HMAC-SHA256(TWO_FACTOR_CHALLENGE_SECRET, context + ':' + code)` and compare with `crypto.timingSafeEqual`.
- **S3 — TOTP Replay Prevention (RFC 6238 §5.2)**: Record `last_used_totp_step` on every accepted TOTP verification and reject any code whose matched time-step `<= last_used_totp_step`.
- **S4 — Cryptographic Token Isolation**: Sign `preAuthToken`, `stepUpToken`, and `passwordResetGrantToken` with `TWO_FACTOR_CHALLENGE_SECRET` (never `JWT_SECRET`) AND bind every grant token to a database row in `auth_step_up_grants` (`jti`, `principal_type`, `principal_id`, `purpose`, `expires_at`, `consumed_at IS NULL`) consumed atomically via `UPDATE ... WHERE jti = $1 AND consumed_at IS NULL RETURNING jti`.
- **S5 — Zero Secret Exposure**: Never place `WHATSAPP_*` or `TWO_FACTOR_*` secrets in `frontend/.env` (`VITE_*`). Never log OTPs, TOTP secrets, tokens, or passwords in production (`WHATSAPP_PROVIDER=console_dev` must throw on boot if `NODE_ENV === 'production'`).
- **S6 — Packaging Guard (`pkg`)**: Remember `backend/package.json` includes `pkg` config. Keep all new backend dependencies pure JavaScript (`qrcode`) and use Node's built-in `crypto` + `fetch` (Node 18+) so there are zero native binary incompatibilities. Do not bundle production `.env` secrets into client-distributed `.exe` builds.

### 0.3 Environment Variables (`backend/.env` & `backend/.env.example` — NAMES ONLY)
```env
# 8. Two-Factor Authentication (TOTP Authenticator App + Step-Up Security)
TWO_FACTOR_ISSUER=AutoFinex
TWO_FACTOR_ENCRYPTION_KEY=                 # 64 hex chars (32 bytes) AES-256-GCM master key
TWO_FACTOR_CHALLENGE_SECRET=               # 64 hex chars (32 bytes) dedicated 2FA JWT/HMAC secret
TWO_FACTOR_TOTP_WINDOW=1                   # ±1 30-second window
TWO_FACTOR_OTP_TTL_SECONDS=300             # 5 minutes
TWO_FACTOR_OTP_RESEND_COOLDOWN_SECONDS=60  # 60 seconds cooldown
TWO_FACTOR_OTP_MAX_ATTEMPTS=5              # Max 5 tries per OTP challenge
TWO_FACTOR_STEP_UP_TTL_SECONDS=300         # 5 minutes single-use step-up grant window

# 9. WhatsApp Business Cloud API (Meta Graph API)
WHATSAPP_PROVIDER=meta_cloud               # meta_cloud | console_dev (dev only) | disabled
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_ACCESS_TOKEN=                     # Meta System User Permanent Token
WHATSAPP_PHONE_NUMBER_ID=                  # Meta WhatsApp Phone Number ID
WHATSAPP_BUSINESS_ACCOUNT_ID=              # Meta WABA ID (optional)
WHATSAPP_APP_SECRET=                       # Meta App Secret (webhook HMAC-SHA256)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=             # Custom webhook verify token
WHATSAPP_OTP_TEMPLATE_NAME=autofinex_auth_otp
WHATSAPP_OTP_TEMPLATE_LANG=en_US
WHATSAPP_DEFAULT_COUNTRY_CODE=91
WHATSAPP_TIMEOUT_MS=10000
```

---

## 1. DATABASE DESIGN (`backend/sql/migrations/009_two_factor_authentication.sql`)

```sql
BEGIN;

-- Optional phone_no on owner so pure owner principals can also use WhatsApp OTP if configured
ALTER TABLE owner ADD COLUMN IF NOT EXISTS phone_no VARCHAR(20) DEFAULT NULL;

-- 1. Per-principal 2FA configuration & encrypted TOTP secret
CREATE TABLE IF NOT EXISTS auth_two_factor_settings (
    id                              UUID            NOT NULL DEFAULT uuidv7(),
    principal_type                  VARCHAR(10)     NOT NULL CHECK (principal_type IN ('user', 'owner')),
    principal_id                    UUID            NOT NULL,
    totp_enabled                    BOOLEAN         NOT NULL DEFAULT false,
    totp_secret_encrypted           TEXT            DEFAULT NULL,
    totp_pending_secret_encrypted   TEXT            DEFAULT NULL,
    totp_pending_expires_at         TIMESTAMPTZ     DEFAULT NULL,
    totp_verified_at                TIMESTAMPTZ     DEFAULT NULL,
    last_used_totp_step             BIGINT          DEFAULT NULL,
    whatsapp_otp_enabled            BOOLEAN         NOT NULL DEFAULT true,
    require_on_login                BOOLEAN         NOT NULL DEFAULT false,
    preferred_method                VARCHAR(20)     NOT NULL DEFAULT 'whatsapp_otp'
                                    CHECK (preferred_method IN ('totp', 'whatsapp_otp')),
    backup_codes_generated_at       TIMESTAMPTZ     DEFAULT NULL,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_auth_2fa_principal UNIQUE (principal_type, principal_id)
);

-- 2. Single-use hashed recovery backup codes (8 per generation)
CREATE TABLE IF NOT EXISTS auth_two_factor_backup_codes (
    id                              UUID            NOT NULL DEFAULT uuidv7(),
    principal_type                  VARCHAR(10)     NOT NULL CHECK (principal_type IN ('user', 'owner')),
    principal_id                    UUID            NOT NULL,
    code_hash                       VARCHAR(128)    NOT NULL,
    used_at                         TIMESTAMPTZ     DEFAULT NULL,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_2fa_backup_principal
    ON auth_two_factor_backup_codes (principal_type, principal_id)
    WHERE used_at IS NULL;

-- 3. Outbound OTP challenges (WhatsApp OTPs for login, step-up, new phone verification, forgot password)
CREATE TABLE IF NOT EXISTS auth_otp_challenges (
    id                              UUID            NOT NULL DEFAULT uuidv7(),
    principal_type                  VARCHAR(10)     NOT NULL CHECK (principal_type IN ('user', 'owner')),
    principal_id                    UUID            NOT NULL,
    purpose                         VARCHAR(40)     NOT NULL
                                    CHECK (purpose IN (
                                        'login_2fa',
                                        'change_password',
                                        'change_username',
                                        'change_phone',
                                        'verify_new_phone',
                                        'change_email',
                                        'manage_2fa',
                                        'forgot_password'
                                    )),
    channel                         VARCHAR(20)     NOT NULL DEFAULT 'whatsapp',
    target_phone_e164               VARCHAR(20)     NOT NULL,
    otp_hash                        VARCHAR(128)    NOT NULL,
    attempts                        INT             NOT NULL DEFAULT 0,
    max_attempts                    INT             NOT NULL DEFAULT 5,
    expires_at                      TIMESTAMPTZ     NOT NULL,
    resend_available_at             TIMESTAMPTZ     NOT NULL,
    consumed_at                     TIMESTAMPTZ     DEFAULT NULL,
    provider_message_id             VARCHAR(120)    DEFAULT NULL,
    ip_address                      VARCHAR(64)     DEFAULT NULL,
    user_agent                      VARCHAR(255)    DEFAULT NULL,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_auth_otp_lookup
    ON auth_otp_challenges (principal_type, principal_id, purpose, created_at DESC);

-- 4. Single-use Step-Up & Password-Reset Grant Ledger (JTI replay prevention)
CREATE TABLE IF NOT EXISTS auth_step_up_grants (
    jti                             UUID            NOT NULL DEFAULT uuidv7(),
    principal_type                  VARCHAR(10)     NOT NULL CHECK (principal_type IN ('user', 'owner')),
    principal_id                    UUID            NOT NULL,
    purpose                         VARCHAR(40)     NOT NULL,
    verified_methods                TEXT[]          NOT NULL DEFAULT '{}',
    payload_meta                    JSONB           DEFAULT NULL,
    expires_at                      TIMESTAMPTZ     NOT NULL,
    consumed_at                     TIMESTAMPTZ     DEFAULT NULL,
    ip_address                      VARCHAR(64)     DEFAULT NULL,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (jti)
);
CREATE INDEX IF NOT EXISTS idx_step_up_grants_principal
    ON auth_step_up_grants (principal_type, principal_id, purpose)
    WHERE consumed_at IS NULL;

-- 5. Security Audit Log (immutable event log, zero secrets)
CREATE TABLE IF NOT EXISTS auth_security_audit_log (
    id                              UUID            NOT NULL DEFAULT uuidv7(),
    event_type                      VARCHAR(60)     NOT NULL,
    principal_type                  VARCHAR(10)     NOT NULL,
    principal_id                    UUID            NOT NULL,
    actor_type                      VARCHAR(10)     DEFAULT NULL,
    actor_id                        UUID            DEFAULT NULL,
    finance_id                      UUID            DEFAULT NULL,
    ip_address                      VARCHAR(64)     DEFAULT NULL,
    user_agent                      VARCHAR(255)    DEFAULT NULL,
    metadata                        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_security_audit_principal
    ON auth_security_audit_log (principal_type, principal_id, created_at DESC);

COMMIT;
```

Also append these 5 tables + `owner.phone_no` to `backend/sql/AutoFinex_final_schema.sql` so fresh deployments stay 100% in sync.

---

## 2. END-TO-END GOOGLE-STYLE FLOW DIAGRAMS

### 2.1 Sensitive Action Step-Up Flow (Change Password / Change Username / Change Email / Manage 2FA)
```
User clicks Action (e.g. "Change Password" or "Change Username")
   │
   ▼
[Step 1: Verify Current Password]
POST /api/auth/2fa/step-up/init { purpose, currentPassword }
   │  Backend verifies currentPassword (rate-limited 5 fails / 15m)
   │  Returns: { stepUpSessionToken, availableMethods: ['totp', 'whatsapp_otp', 'backup_code'],
   │             preferredMethod: 'totp', maskedPhone: '+91 ••••••4321' }
   ▼
[Step 2: 2-Step Verification Modal ("Verify it's you")]
   ├── Option A (Default if enrolled): Enter 6-digit Authenticator App TOTP code
   ├── Option B ("Try another way"): Click "Send code via WhatsApp (+91 ••••••4321)"
   │      -> POST /api/auth/2fa/whatsapp/send { stepUpSessionToken }
   │      -> Meta Cloud API sends 6-digit OTP -> User enters 6-digit code
   └── Option C ("Try another way"): Enter 8-character Backup Recovery Code
   │
   ▼
POST /api/auth/2fa/step-up/verify { stepUpSessionToken, method, code }
   │  Backend verifies TOTP (anti-replay) / WhatsApp OTP / Backup Code
   │  Inserts row in `auth_step_up_grants` (TTL = 5 min, consumed_at = NULL)
   │  Returns: { stepUpGrantToken }
   ▼
[Step 3: Execute Protected Mutation]
   ├── POST /api/auth/change-password     { currentPassword, newPassword, stepUpGrantToken }
   ├── PATCH /api/user/identity/username  { newUsername, stepUpGrantToken }
   ├── PATCH /api/user/identity/email     { newEmail, stepUpGrantToken }
   └── PATCH /api/user/identity/phone     { newPhone, stepUpGrantToken, newPhoneOtpChallengeId, newPhoneOtpCode }
       (Note: Phone change ALSO verifies a WhatsApp OTP sent to `newPhone` before updating `users.phone_no`!)
```

### 2.2 Forgot Password + Adaptive 2FA Flow (`ForgotPassword.tsx`)
```
User clicks "Forgot password?" on UserLogin.tsx
   │
   ▼
[Step 1: Identify Account]
POST /api/auth/forgot-password/init { identifier }  (username OR 10-digit phone_no)
   │  Looks up active user in `users`
   │  Sends 6-digit WhatsApp OTP to user's registered phone_no
   │  Returns: { recoverySessionToken, maskedPhone: '+91 ••••••4321' }
   ▼
[Step 2: Verify Registered WhatsApp OTP]
POST /api/auth/forgot-password/verify-whatsapp { recoverySessionToken, code }
   │
   ├── If user does NOT have Authenticator TOTP enabled (`totp_enabled = false`):
   │      -> Issues single-use 5-min `passwordResetGrantToken` immediately!
   │
   └── If user DOES have Authenticator TOTP enabled (`totp_enabled = true`):
          -> Returns `{ requiresSecondFactor: true, allowedMethods: ['totp', 'backup_code'] }`
          -> [Step 2B]: User enters 6-digit Authenticator code OR 8-char Backup Code
          -> POST /api/auth/forgot-password/verify-totp { recoverySessionToken, method, code }
          -> Issues single-use 5-min `passwordResetGrantToken`!
   ▼
[Step 3: Set New Password]
POST /api/auth/forgot-password/complete { passwordResetGrantToken, newPassword }
   │  Atomically consumes grant JTI, hashes newPassword (bcrypt), sets password_changed_at = NOW(),
   │  closes ALL open `agent_login_sessions` (`logout_reason = 'password_reset'`),
   │  logs `forgot_password_completed`, and sends WhatsApp security alert.
```

---

## 3. REST API SPECIFICATION

| Method & Path | Auth | Purpose |
| :--- | :--- | :--- |
| `GET /api/auth/2fa/status` | User/Owner JWT | Returns current principal's 2FA status (`totpEnabled`, `whatsappOtpEnabled`, `requireOnLogin`, `preferredMethod`, `maskedPhone`, `backupCodesRemaining`). |
| `POST /api/auth/2fa/step-up/init` | User/Owner JWT | Verifies `currentPassword` for a named `purpose` and returns a 5-min `stepUpSessionToken` + `availableMethods`. |
| `POST /api/auth/2fa/whatsapp/send` | `stepUpSessionToken` or `preAuthToken` | Rate-limited (60s cooldown); generates CSPRNG 6-digit OTP, stores HMAC in `auth_otp_challenges`, dispatches via Meta WhatsApp Cloud API. |
| `POST /api/auth/2fa/step-up/verify` | `stepUpSessionToken` | Verifies `totp`, `whatsapp_otp`, or `backup_code` and returns single-use `stepUpGrantToken`. |
| `POST /api/auth/2fa/totp/setup-init` | User/Owner JWT + `stepUpGrantToken` (`manage_2fa`) | Generates 20-byte secret, stores encrypted pending secret, returns `{ qrDataUrl, manualEntryKey, otpauthUrl }`. |
| `POST /api/auth/2fa/totp/setup-confirm` | User/Owner JWT + `stepUpGrantToken` | Verifies first 6-digit TOTP code against pending secret, activates `totp_enabled = true`, returns 8 plaintext Backup Codes (shown once). |
| `POST /api/auth/2fa/totp/disable` | User/Owner JWT + `stepUpGrantToken` (`manage_2fa`) | Disables TOTP, wipes `totp_secret_encrypted` and unused backup codes. |
| `POST /api/auth/2fa/backup-codes/regenerate` | User/Owner JWT + `stepUpGrantToken` (`manage_2fa`) | Replaces backup codes with 8 fresh codes and returns them once. |
| `PATCH /api/auth/2fa/preferences` | User/Owner JWT + `stepUpGrantToken` (`manage_2fa`) | Updates `require_on_login` and `preferred_method`. |
| `POST /api/auth/user-login` | Owner JWT | Existing login; if `require_on_login` or `totp_enabled` is active, returns `{ success: true, requires2FA: true, preAuthToken, availableMethods, preferredMethod, maskedPhone }`. |
| `POST /api/auth/user-login/verify-2fa` | Owner JWT + `preAuthToken` | Verifies 2FA code, inserts `agent_login_sessions`, issues full 24h `userToken`. |
| `POST /api/auth/change-password` | User/Owner JWT | Updated to require valid `stepUpGrantToken` (`purpose = 'change_password'`) whenever user has any 2FA factor available (`totp_enabled` or valid `phone_no`). |
| `PATCH /api/user/identity` | User JWT + `stepUpGrantToken` | Updates `username`, `email`, or `phone_no` (for `phone_no`, also requires verified OTP on the new phone via `POST /api/user/identity/send-new-phone-otp`). |
| `POST /api/auth/forgot-password/init` | Public (rate-limited) | Initiates Forgot Password by `identifier` (username or phone) and sends WhatsApp OTP. |
| `POST /api/auth/forgot-password/verify-whatsapp` | Public (rate-limited) | Verifies WhatsApp OTP; either issues `passwordResetGrantToken` or requests TOTP/Backup Code if `totp_enabled`. |
| `POST /api/auth/forgot-password/verify-totp` | Public (rate-limited) | Verifies TOTP/Backup Code for TOTP-protected accounts and issues `passwordResetGrantToken`. |
| `POST /api/auth/forgot-password/complete` | Public (`passwordResetGrantToken`) | Resets password, revokes all sessions, sends WhatsApp alert. |
| `POST /api/auth/users/:userId/reset-2fa` | `ownerOnly` | Owner emergency reset of a staff/agent's TOTP & 2FA lock (requires Owner's `currentPassword` confirmation; writes audit log). |

---

## 4. PHASE-BY-PHASE IMPLEMENTATION TASKS

### PHASE 1 — Database Migration & Config Validation
**Files:**
- Create: `backend/sql/migrations/009_two_factor_authentication.sql`
- Modify: `backend/sql/AutoFinex_final_schema.sql`
- Create: `backend/src/modules/auth/twoFactor.config.js`

**Tasks:**
1. Write `009_two_factor_authentication.sql` with all 5 tables + `owner.phone_no` (idempotent `IF NOT EXISTS`).
2. Append the exact table definitions to `backend/sql/AutoFinex_final_schema.sql`.
3. Create `twoFactor.config.js` that loads and validates `TWO_FACTOR_*` and `WHATSAPP_*` env vars, failing fast in `production` if `TWO_FACTOR_ENCRYPTION_KEY` is not 64 hex chars, if `TWO_FACTOR_CHALLENGE_SECRET === JWT_SECRET`, or if `WHATSAPP_PROVIDER === 'console_dev'`.
4. **Verification**: Run migration against PostgreSQL DB and verify tables/columns via `information_schema` + unit test `twoFactor.config.js`.

---

### PHASE 2 — Pure-Crypto TOTP, AES-256-GCM & Backup Code Engine (TDD)
**Files:**
- Install in `backend/`: `npm install qrcode` (pure JS, `pkg`-safe)
- Create: `backend/src/modules/auth/twoFactorCrypto.service.js`
- Test: `backend/src/modules/auth/twoFactorCrypto.test.js`

**Tasks:**
1. Write failing unit tests in `twoFactorCrypto.test.js` covering:
   - AES-256-GCM `encryptSecret` / `decryptSecret` round-trip, tamper rejection (flipped ciphertext/authTag byte throws), and invalid key rejection.
   - Base32 RFC 4648 encode/decode + RFC 6238 TOTP generation & verification (`window = 1`), plus replay rejection when `matchedStep <= lastUsedStep`.
   - 6-digit CSPRNG OTP generation (`crypto.randomInt(100000, 1000000)`), HMAC-SHA256 hashing, and constant-time comparison.
   - 8-code backup code generator (`XXXX-XXXX` unambiguous alphabet excluding `0/O/1/I`), hashing, and single-use verification.
2. Implement `twoFactorCrypto.service.js` and `qrcode` DataURL helper.
3. **Verification**: `node --test backend/src/modules/auth/twoFactorCrypto.test.js` -> 100% pass.

---

### PHASE 3 — WhatsApp Cloud API Provider (`whatsappOtp.service.js` + Tests)
**Files:**
- Create: `backend/src/modules/auth/whatsappOtp.service.js`
- Test: `backend/src/modules/auth/whatsappOtp.test.js`

**Tasks:**
1. Normalize Indian 10-digit mobile numbers (`9876543210` -> `919876543210`), reject malformed phone numbers, and provide `maskPhoneDisplay('919876543210')` -> `'+91 ••••••3210'`.
2. Implement Meta Graph API `POST https://graph.facebook.com/${version}/${phoneNumberId}/messages` with `AbortController` (`WHATSAPP_TIMEOUT_MS`) sending the standard Meta **Authentication** template payload:
   ```json
   {
     "messaging_product": "whatsapp",
     "recipient_type": "individual",
     "to": "919876543210",
     "type": "template",
     "template": {
       "name": "autofinex_auth_otp",
       "language": { "code": "en_US" },
       "components": [
         {
           "type": "body",
           "parameters": [{ "type": "text", "text": "123456" }]
         },
         {
           "type": "button",
           "sub_type": "url",
           "index": "0",
           "parameters": [{ "type": "text", "text": "123456" }]
         }
       ]
     }
   }
   ```
   *(Include automatic fallback retry without the `button` component if the user's approved Meta template only has a `body` parameter without a Copy-Code URL button!)*
3. Support `WHATSAPP_PROVIDER=console_dev` strictly when `NODE_ENV !== 'production'` so local development can test end-to-end even before Meta Business verification finishes.
4. **Verification**: `node --test backend/src/modules/auth/whatsappOtp.test.js` (mocking `fetch` for success, non-button fallback, 401/429 error mapping, timeout, and production `console_dev` block).

---

### PHASE 4 — Backend 2FA Service, Step-Up Grants, Login 2FA, Identity Edit & Forgot Password
**Files:**
- Create: `backend/src/modules/auth/twoFactor.service.js`
- Create: `backend/src/modules/auth/twoFactor.routes.js`
- Modify: `backend/src/modules/auth/changePassword.service.js`
- Modify: `backend/src/modules/auth/auth.routes.js`
- Modify: `backend/src/modules/users/userProfile.service.js` & `userProfile.routes.js`
- Test: `backend/src/modules/auth/twoFactor.service.test.js`

**Tasks:**
1. Implement `twoFactor.service.js` with full DB transaction safety (`BEGIN` / `COMMIT` / `ROLLBACK`), atomic consumption of `auth_step_up_grants`, TOTP `last_used_totp_step` anti-replay lock (`SELECT ... FOR UPDATE`), OTP cooldown & max-attempt enforcement, and `auth_security_audit_log` recording.
2. Integrate `consumeStepUpGrant` into `changePassword.service.js` (`purpose: 'change_password'`).
3. Add `PATCH /api/user/identity` + `POST /api/user/identity/send-new-phone-otp` in `userProfile.routes.js` for Google-style `username`, `email`, and `phone_no` updates.
4. Update `userProfile.service.js` (`GET /api/user/profile-overview`) so `profile.twoFactor` returns real DB status instead of hardcoded `Disabled`.
5. Update `POST /api/auth/user-login` + add `POST /api/auth/user-login/verify-2fa` for 2-Step Login.
6. Replace legacy `/request-reset` & `/reset-password` logic with the 3-step `forgot-password/*` endpoints (while keeping backward-compatible error shapes) and add `POST /api/auth/users/:userId/reset-2fa` (`ownerOnly`).
7. **Verification**: Run all backend unit & integration tests (`npm test` in `backend/`).

---

### PHASE 5 — Frontend Google-Style 2FA UI (`UserProfile`, `ChangePasswordDialog`, `UserLogin`, `ForgotPassword`)
**Files:**
- Create: `frontend/src/api/twoFactorApi.ts`
- Create: `frontend/src/components/auth/StepUpVerificationModal.tsx` (Reusable Google-style `"Verify it's you"` modal supporting Password -> Authenticator TOTP / WhatsApp OTP / Backup Code + `"Try another way"` switcher using `input-otp`)
- Create: `frontend/src/components/auth/TwoFactorSettingsDialog.tsx` (QR Code scan wizard, manual Base32 key copy, 6-digit verification, one-time Backup Codes download/copy card, Login 2FA toggle, Preferred Method selector)
- Create: `frontend/src/components/auth/EditAccountIdentityDialog.tsx` (Edit Username, Email, Phone Number with live availability check + Step-Up 2FA + New Phone WhatsApp OTP verification)
- Modify: `frontend/src/components/auth/ChangePasswordDialog.tsx` (Seamless 2-step Password + 2FA verification flow)
- Modify: `frontend/src/pages/UserProfile.tsx` (Real 2FA status badge in Security card, `"Manage 2FA"` button, wired `"Edit Profile"` button)
- Modify: `frontend/src/pages/UserLogin.tsx` + `frontend/src/contexts/AuthContext.tsx` (2-Step Verification screen on login + `"Forgot password?"` link)
- Modify: `frontend/src/pages/ForgotPassword.tsx` + `frontend/src/App.tsx` (Multi-step WhatsApp OTP -> Adaptive TOTP/Backup Code -> New Password wizard)

**Verification**: `npx tsc --noEmit` and `npm run build` in `frontend/`.

---

### PHASE 6 — Agent Management Owner Controls & End-to-End Verification
**Files:**
- Modify: `frontend/src/components/agents/AgentManagement.tsx`
- Modify: `frontend/src/components/agents/UserDetailModal.tsx`
- Modify: `backend/src/modules/auth/auth.routes.js` (`/allUsers` enriched with `two_factor_enabled` and `totp_enabled` booleans — NEVER secret fields!)

**Tasks:**
1. Show 2FA status badge in `AgentManagement.tsx` and `UserDetailModal.tsx`.
2. Add Owner-only **"Reset User 2FA"** button in `UserDetailModal.tsx` with Owner password confirmation dialog for emergency staff recovery.
3. Run full test suite (`backend` unit tests + `frontend` TypeScript check + production Vite build + security assertion check verifying zero secrets/hashes in any API response).

