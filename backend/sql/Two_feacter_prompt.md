Analyzed SKILL.md:L1-98
Analyzed UserProfile.tsx:L1-724
Analyzed UserLogin.tsx:L1-360
Analyzed AgentManagement.tsx:L1-568
Ran list backend and frontend directories
Analyzed SKILL.md:L1-127
Analyzed SKILL.md:L1-177
Analyzed SKILL.md:L1-47
Analyzed SKILL.md:L1-493
Ran list auth, users, sql, and frontend auth/agent files
Analyzed ChangePasswordDialog.tsx:L1-356
Analyzed ForgotPassword.tsx:L1-133
Analyzed ResetPassword.tsx:L1-169
Analyzed changePassword.service.js:L1-460
Analyzed package.json:L1-50
Analyzed package.json:L1-107
Analyzed .env.example:L1-103
Analyzed .env.example:L1-25
Analyzed auth.routes.js:L1-800
Analyzed auth.routes.js:L801-1600
Analyzed App.tsx:L1-513
Analyzed auth.routes.js:L1601-2083
Analyzed OwnerLogin.tsx:L1-567
Analyzed AuthContext.tsx:L1-688
Analyzed AddUserForm.tsx:L1-800
Analyzed UserDetailModal.tsx:L1-216
Analyzed 008_password_changed_at.sql:L1-17
Analyzed server.js:L1-137
Analyzed auth.middleware.js:L1-429
Analyzed userProfileApi.ts:L1-144
Ran check schema tables, WhatsApp references, and env variable names
Analyzed userProfile.service.js:L1-300
Ran check backend .env trailing newline and existing 2FA keys
Edited .env.example
Ran append 2FA and WhatsApp env placeholders to backend/.env
Ran check workspace root directories

Error: API error (attempt 1): request failed: Post "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse": http2: timeout awaiting response headers (Error ID: 22d38fcd-a0f5-4b4e-86fa-98e1604519ea-1827)

Analyzed OCR_IMPLEMENTATION_PLAN.md:L1-60
Created TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md

*Using skills: `using-superpowers`, `security-auditor`, `auth-implementation-patterns`, `whatsapp-cloud-api`, and `writing-plans`.*

உங்களுடைய கோப்புகளை ([`UserProfile.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx), [`UserLogin.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserLogin.tsx), [`AgentManagement.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/AgentManagement.tsx), [`AddUserForm.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/AddUserForm.tsx), [`ChangePasswordDialog.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/auth/ChangePasswordDialog.tsx), [`ForgotPassword.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/ForgotPassword.tsx), [`auth.routes.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/auth.routes.js), [`changePassword.service.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/changePassword.service.js), மற்றும் Database Schema) முழுமையாக ஆய்வு செய்துவிட்டேன்.

நீங்கள் கேட்டபடியே:
1. **[`backend/.env`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/.env) மற்றும் [`backend/.env.example`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/.env.example)** ஆகிய இரண்டிலும் தேவையான அனைத்து Environment Variables-களையும் (ஏற்கனவே உள்ள எந்த மதிப்பையும் மாற்றாமல்) உருவாக்கிவிட்டேன்.
2. முழுமையான **6-Phase Master Implementation Plan**-ஐ [`backend/sql/TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/sql/TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md) கோப்பில் சேமித்துள்ளேன்.

---

# 1. நீங்கள் எனக்குக் கொடுக்க வேண்டிய API Keys (`.env` Checklist)

> **Security Rule:** எந்தவொரு API Key-யும் [`frontend/.env`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/.env)-ல் (`VITE_*`) வைக்கக்கூடாது (Browser-ல் அனைவருக்கும் தெரிந்துவிடும்). அனைத்தும் [`backend/.env`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/.env)-ல் மட்டுமே பாதுகாப்பாக இருக்க வேண்டும்.

[`backend/.env`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/.env)-ல் உள்ள `TWO_FACTOR_ENCRYPTION_KEY`, `TWO_FACTOR_CHALLENGE_SECRET`, மற்றும் `WHATSAPP_WEBHOOK_VERIFY_TOKEN` ஆகிய 256-bit Cryptographic Keys-ஐ நானே `crypto.randomBytes(32)` மூலம் பாதுகாப்பாக Generate செய்து போட்டுவிட்டேன்.

### **Authenticator App (QR Code / Google Authenticator)-க்கு எந்த API Key-யும் தேவையில்லை!**
- Google Authenticator / Microsoft Authenticator / Authy ஆகியவை **RFC 6238 TOTP** தரநிலையில் இயங்குகின்றன. இதற்கு மூன்றாம் தரப்பு கட்டண API எதுவும் தேவையில்லை — நம்முடைய Node.js `crypto` + `qrcode` மூலமே 100% Offline-compatible ஆகவும் இலவசமாகவும் இயங்கும்.

### **WhatsApp OTP-க்கு மட்டும் நீங்கள் Meta Business-லிருந்து நிரப்ப வேண்டிய 4 விவரங்கள் (`backend/.env`):**
Official **Meta WhatsApp Business Cloud API** (இடைத்தரகர் கட்டணம் இல்லாமல் நேரடியாக Meta மூலமே அனுப்புவது மிகவும் பாதுகாப்பானது மற்றும் செலவு குறைவானது):

| `.env` Variable Name | நீங்கள் எங்கிருந்து எடுத்துப் போட வேண்டும்? | கட்டாயமா? |
| :--- | :--- | :--- |
| `WHATSAPP_ACCESS_TOKEN` | **Meta Business Settings → Users → System Users** → உருவாக்கிய **Permanent Access Token** (`EAA...`). *(24-மணி நேர Temporary Token-க்கு பதிலாக System User Token போடவும்).* | **ஆம் (Required)** |
| `WHATSAPP_PHONE_NUMBER_ID` | **Meta for Developers → Your App → WhatsApp → API Setup** பக்கத்தில் உள்ள **Phone Number ID** (உதா: `104928374650192` — இது மொபைல் நம்பர் அல்ல, Meta கொடுக்கும் Numeric ID). | **ஆம் (Required)** |
| `WHATSAPP_OTP_TEMPLATE_NAME` | Meta WhatsApp Manager-ல் **Authentication** பிரிவில் (Category: `AUTHENTICATION`) நீங்கள் Approve செய்த OTP Template பெயர் (Default: `autofinex_auth_otp`, Language: `en_US`). | **ஆம் (Required)** |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | அதே API Setup பக்கத்தில் உள்ள **WhatsApp Business Account ID (WABA ID)**. | Optional (Recommended) |
| `WHATSAPP_APP_SECRET` | **Meta App Settings → Basic → App Secret** (Webhook signature சரிபார்க்க). | Optional |

> **💡 Local Testing வசதி:** உங்களுக்கு Meta Template Approval வருவதற்கு முன்பே நாம் முழு 2FA-வையும் டெஸ்ட் செய்ய `WHATSAPP_PROVIDER=console_dev` (Development-ல் மட்டும் இயங்கும்; Production-ல் தானாக Block ஆகும்) வசதியையும் பிளானில் சேர்த்துள்ளேன்!
>
> **⚠️ Security Audit எச்சரிக்கை ([`backend/package.json`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/package.json#L36-L41)):** `pkg.assets`-ல் `".env"` உள்ளது. நீங்கள் கிளையன்ட்களுக்கு `.exe` பில்டு கொடுக்கும்போது Production WhatsApp Token உள்ள `.env`-ஐ `.exe`-க்குள் சேர்த்து பில்டு செய்ய வேண்டாம் — Server-ல் மட்டுமே `.env` இருக்க வேண்டும்.

---

# 2. Existing Codebase ஆய்வில் கண்டறியப்பட்ட முக்கிய விஷயங்கள்

1. **[`UserProfile.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx#L336-L466)**:
   - Security Card-ல் `Two-Factor Auth` தற்போது Hardcoded `Disabled` ([L455](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx#L455)) என்று உள்ளது.
   - மேலே உள்ள `Edit Profile` பட்டனில் ([L336](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx#L336)) இன்னும் `onClick` இணைக்கப்படவில்லை. இதை இணைத்து Username, Phone, Email மாற்றும்போது Google போலவே **Step-Up 2FA** கேட்கும்படி செய்வோம்.
2. **[`ChangePasswordDialog.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/auth/ChangePasswordDialog.tsx) & [`changePassword.service.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/changePassword.service.js)**:
   - ஏற்கனவே Current Password சரிபார்ப்பு, Rate Limiting (15 நிமிடத்தில் 5 தவறான முயற்சிகள்), மற்றும் மற்ற Session-களை Logout செய்யும் வசதி ([L411-L421](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/changePassword.service.js#L411-L421)) அருமையாக உள்ளது. இதனுடன் **Step 2: 2FA Verification (`stepUpGrantToken`)** இணைக்கப்படும்.
3. **[`UserLogin.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserLogin.tsx), [`ForgotPassword.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/ForgotPassword.tsx) & [`auth.routes.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/auth.routes.js#L1888-L1968)**:
   - தற்போது [`UserLogin.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserLogin.tsx)-ல் `"Forgot password?"` லிங்கே இல்லை!
   - மேலும் [`auth.routes.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/auth.routes.js#L1904)-ல் பழைய `/request-reset` ரூட் நீக்கப்பட்ட `users.role` காலத்தைத் தேடுவதால் உடைந்துள்ளது மற்றும் `resetLink`-ஐ நேரடியாக JSON-ல் அனுப்புகிறது (பாதுகாப்பு குறைபாடு). இதை முழுமையாக **WhatsApp OTP + Adaptive Authenticator 2FA** முறையாக மாற்றுவோம்.
4. **[`AddUserForm.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/AddUserForm.tsx#L330-L334) & [`AgentManagement.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/AgentManagement.tsx)**:
   - ஒவ்வொரு யூசருக்கும் `users.phone_no` 10-இலக்க எண்ணாக Unique-ஆக சேமிக்கப்படுகிறது (`9876543210`). இதை நம் Backend தானாக `919876543210` (E.164) வடிவிற்கு மாற்றி WhatsApp OTP அனுப்பும்.
   - [`frontend/package.json`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/package.json#L66)-ல் ஏற்கனவே `input-otp` (`^1.4.2`) இன்ஸ்டால் செய்யப்பட்டுள்ளது — அதனால் அழகான 6-இலக்க OTP பெட்டிகளை நேரடியாகப் பயன்படுத்தலாம்!

---

# 3. Google-Style Complete 2FA & OTP Flows (எப்போதெல்லாம் எப்படி வேலை செய்யும்?)

### A. இரண்டு 2FA முறைகள் + Backup Codes (`UserProfile.tsx` → Security Card)
1. **Method 1 — WhatsApp OTP (`whatsapp_otp`)**:
   - யூசரின் பதிவு செய்யப்பட்ட மொபைல் எண்ணிற்கு (`+91 ••••••4321`) 6-இலக்க OTP அனுப்பப்படும்.
   - 5 நிமிடம் மட்டுமே செல்லுபடியாகும் (`300s`), 60 விநாடி Resend Cooldown, அதிகபட்சம் 5 தவறான முயற்சிகள் மட்டுமே அனுமதிக்கப்படும்.
2. **Method 2 — Authenticator App QR Code (`totp`)**:
   - `UserProfile` → Security Card-ல் **"Setup Authenticator App"** கிளிக் செய்தால்:
     1. முதலில் **Current Password** கேட்டு *"Verify it's you"* சரிபார்க்கும்.
     2. **QR Code** (மற்றும் Manual Secret Key) காட்டப்படும். யூசர் Google Authenticator / Microsoft Authenticator ஆப்பில் ஸ்கேன் செய்து 6-இலக்க கோடை உள்ளிடுவார்.
     3. உடனே **8 Single-Use Backup Codes** (`XXXX-XXXX` வடிவத்தில்) ஒருமுறை காட்டப்படும் (மொபைல் தொலைந்துவிட்டால் அல்லது சிக்னல் இல்லாதபோது பயன்படுத்த).

---

### B. எப்போதெல்லாம் 2FA கேட்கும்? (Google-Style Step-Up Matrix)

| செயல் (Sensitive Action) | Google-Style Verification Flow |
| :--- | :--- |
| **1. Change Password** ([`ChangePasswordDialog.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/auth/ChangePasswordDialog.tsx)) | **Step 1:** Current Password + New Password உள்ளிடவும்.<br>**Step 2 ("Verify it's you"):** Authenticator ஆப் Enable செய்திருந்தால் **6-digit TOTP** கேட்கும். கீழே **"Try another way"** கிளிக் செய்து **WhatsApp OTP** அல்லது **Backup Code** மூலமும் சரிபார்க்கலாம்.<br>**Step 3:** Password மாற்றப்பட்டு, மற்ற அனைத்து டிவைஸ் செஷன்களும் (`agent_login_sessions`) உடனே Logout செய்யப்படும். |
| **2. Change Username (`@username`)** ([`UserProfile.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx)) | Live Username Availability செக் + **Current Password + 2FA** (Authenticator TOTP அல்லது WhatsApp OTP) சரிபார்த்த பிறகே Username மாறும். |
| **3. Change Mobile Number (`phone_no`)** | **இரட்டைப் பாதுகாப்பு (Double Lock):**<br>1. முதலில் பழைய கணக்கின் உரிமையாளர் என்பதை உறுதிப்படுத்த **Current Password + 2FA**.<br>2. அடுத்து **புதிய மொபைல் எண்ணிற்கு** ஒரு WhatsApp OTP அனுப்பி அது வேலை செய்கிறதா என உறுதிப்படுத்திய பிறகே நம்பர் மாறும் (தவறான நம்பர் போட்டு கணக்கு Lock ஆவதைத் தடுக்க!). |
| **4. Change Email (`email`)** | Email Availability செக் + **Current Password + 2FA** சரிபார்த்த பிறகே மாறும். |
| **5. Disable Authenticator / Regenerate Backup Codes** | **Current Password + 2FA** கொடுத்தால் மட்டுமே 2FA-வை ஆஃப் செய்யவோ புதிய Backup Codes எடுக்கவோ முடியும். |
| **6. User Login** ([`UserLogin.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserLogin.tsx)) | யூசர் **Login 2FA / Authenticator** ஆன் செய்திருந்தால்: Username + Password சரியானதும் நேரடியாக உள்ளே விடாமல், 5-நிமிட `preAuthToken` கொடுத்து **2-Step Verification** திரைக்குச் செல்லும். TOTP அல்லது `"Try another way"` → WhatsApp OTP கொடுத்த பிறகே முழு JWT Token வழங்கப்படும். *(நீங்கள் சொன்னபடியே சாதாரண தவறான லாகின் முயற்சிகளுக்கு Account Lockout இப்போது வைக்கப்படவில்லை).* |

---

### C. Forgot Password Flow (பாஸ்வேர்ட் மறந்துவிட்டால் என்ன நடக்கும்?)

இது மிக முக்கியமான பாதுகாப்புப் பகுதி — ஒருவருக்கு WhatsApp மட்டும் கிடைத்தால் அவருடைய Authenticator 2FA-வை தாண்டிவிடக் கூடாது!

```
[UserLogin.tsx] -> "Forgot password?" கிளிக் செய்கிறார்
       │
       ▼
Step 1: Username அல்லது பதிவு செய்த 10-இலக்க மொபைல் எண்ணை உள்ளிடுகிறார்
       │
       ▼
Step 2: பதிவு செய்யப்பட்ட மொபைல் எண்ணிற்கு (+91 ••••••4321) 6-இலக்க WhatsApp OTP போகிறது
        -> யூசர் OTP-ஐ உள்ளிட்டு சரிபார்க்கிறார்
       │
       ├──► நிலை A (யூசர் Authenticator App ஆன் செய்யவில்லை — WhatsApp மட்டும் உள்ளவர்):
       │       -> 5-நிமிட Single-Use `passwordResetGrantToken` வழங்கப்படும் -> புதிய Password மாற்றலாம்!
       │
       ├──► நிலை B (யூசர் Authenticator App [TOTP] ஆன் செய்துள்ளார்!):
       │       -> Google போலவே அடுத்த படியாக "Enter your 6-digit Authenticator Code (or Backup Code)" கேட்கும்!
       │       -> அதுவும் சரியாக இருந்தால் மட்டுமே புதிய Password மாற்ற அனுமதிக்கும்!
       │
       └──► நிலை C (ஸ்டாஃப் மொபைலையும் தொலைத்துவிட்டார், Backup Code-ம் இல்லை!):
               -> "Contact your Finance Owner to reset 2FA" என்று காட்டும்.
               -> Owner தன்னுடைய `AgentManagement` -> `UserDetailModal`-ல் சென்று,
                  தன்னுடைய Owner Password-ஐ உறுதிப்படுத்தி "Reset User 2FA" செய்ய முடியும் (Audit Log-ல் பதிவாகும்).
```
புதிய பாஸ்வேர்ட் மாற்றியவுடன், பழைய அனைத்து Active Sessions-ம் உடனடியாக மூடப்படும் (`logout_reason = 'password_reset'`), மேலும் யூசரின் WhatsApp-க்கு *"உங்கள் AutoFinex பாஸ்வேர்ட் மாற்றப்பட்டது"* என்ற Security Alert செய்தி செல்லும்.

---

# 4. உயர்தர பாதுகாப்பு வடிவமைப்பு (Enterprise Security Controls)

1. **AES-256-GCM Encryption at Rest**: டேட்டாபேஸில் TOTP Secret ஒருபோதும் சாதாரண எழுத்தாக (Plaintext) சேமிக்கப்படாது; `TWO_FACTOR_ENCRYPTION_KEY` கொண்டு `AES-256-GCM` முறையில் Encrypt செய்தே சேமிக்கப்படும்.
2. **HMAC-SHA256 OTP & Backup Code Hashing**: அனுப்பப்படும் 6-இலக்க WhatsApp OTP-யும் Backup Codes-ம் டேட்டாபேஸில் Hash ஆக மட்டுமே இருக்கும் (`crypto.timingSafeEqual` ஒப்பீடு).
3. **Anti-Replay Protection (`last_used_totp_step`)**: ஒரு முறை பயன்படுத்திய 6-இலக்க Authenticator கோடை அதே 30 விநாடிக்குள் இரண்டாவது முறை யாரும் மீண்டும் பயன்படுத்த முடியாது (RFC 6238 §5.2).
4. **Separate Challenge Secret + Single-Use DB `jti`**: `preAuthToken`, `stepUpGrantToken`, மற்றும் `passwordResetGrantToken` ஆகியவை சாதாரண `JWT_SECRET`-ல் கையெழுத்திடப்படாமல், தனிப்பட்ட `TWO_FACTOR_CHALLENGE_SECRET`-ல் கையெழுத்திடப்பட்டு `auth_step_up_grants` டேட்டாபேஸ் அட்டவணையில் **ஒரே ஒரு முறை மட்டுமே (`consumed_at IS NULL`)** பயன்படுத்தும்படி பூட்டப்படும்.

---

# 5. Implementation Roadmap (6 Phases — Saved in [`TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/sql/TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md))

| Phase | என்ன உருவாக்கப்படும்? | முக்கிய கோப்புகள் |
| :--- | :--- | :--- |
| **Phase 1** | PostgreSQL Migration (`009_two_factor_authentication.sql`) — 5 புதிய 2FA & Security Audit அட்டவணைகள் + Env Config Validator | `backend/sql/migrations/009_two_factor_authentication.sql`, `twoFactor.config.js` |
| **Phase 2** | Pure-Crypto Engine: `AES-256-GCM`, RFC 6238 TOTP, QR Generator (`qrcode`), Backup Codes + Unit Tests | `twoFactorCrypto.service.js`, `twoFactorCrypto.test.js` |
| **Phase 3** | Official Meta WhatsApp Cloud API (`v21.0`) OTP & Security Alert Service + Dev Console Fallback + Unit Tests | `whatsappOtp.service.js`, `whatsappOtp.test.js` |
| **Phase 4** | Backend 2FA Routes, Step-Up Grants, Login 2FA, Change Password 2FA, Identity Edit (`username`/`phone`/`email`), Forgot Password, Owner 2FA Reset | `twoFactor.service.js`, `twoFactor.routes.js`, [`changePassword.service.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/changePassword.service.js), [`auth.routes.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/auth/auth.routes.js), [`userProfile.service.js`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/src/modules/users/userProfile.service.js) |
| **Phase 5** | Frontend Google-Style Modals (`StepUpVerificationModal`, `TwoFactorSettingsDialog` QR Wizard, `EditAccountIdentityDialog`, `ChangePasswordDialog`, `UserLogin`, `ForgotPassword`) | [`UserProfile.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserProfile.tsx), [`UserLogin.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/UserLogin.tsx), [`ForgotPassword.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/pages/ForgotPassword.tsx), `frontend/src/components/auth/*` |
| **Phase 6** | Agent Management 2FA Status Badges + Owner Emergency `"Reset User 2FA"` Modal + Full Build & Security Verification | [`AgentManagement.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/AgentManagement.tsx), [`UserDetailModal.tsx`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/frontend/src/components/agents/UserDetailModal.tsx) |

---

### அடுத்த படி (How would you like to proceed?)
முழுத் திட்டமும் [`backend/sql/TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/sql/TWO_FACTOR_AUTH_IMPLEMENTATION_PLAN.md)-ல் தயாராக உள்ளது.
1. நீங்கள் [`backend/.env`](file:///run/media/omerchy/A23F-9E6F/Rimi_finance_app/backend/.env)-ல் Meta WhatsApp API விவரங்களை இப்போது போடுகிறீர்களா, அல்லது முதலில் `WHATSAPP_PROVIDER=console_dev` வைத்துக்கொண்டு **Phase 1 முதல் Phase 6 வரை** உடனே Implement செய்யத் தொடங்கட்டுமா? (Meta API கீயை நீங்கள் எப்போது போட்டாலும் `WHATSAPP_PROVIDER=meta_cloud` என மாற்றினால் உடனே Live ஆகிவிடும்!)