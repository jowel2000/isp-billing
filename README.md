# JR COMMUNICATION — Smart ISP Billing Software

Single-ISP billing platform built for a Triangle LISP tenant.

- **Phase 0 (complete):** monorepo, database schema, JWT auth, RBAC, settings API, Triangle adapter skeleton, login/dashboard UI.
- **Phase 1 (backend core complete):** clients, packages, areas, encrypted PPPoE/NID reveal with audit, client portal APIs. Live Triangle sync is the remaining integration.
- **Phase 2 (backend core complete):** invoices with 5% VAT, manual bKash verification, ledger entries, reports. PDF and SMS delivery remain.
- **Phase 3 (backend core complete):** auto-recharge queue + Super Admin toggle + approval threshold. The live Triangle recharge worker requires a valid upstream session/OTP.
- **Phase 4:** hardening, shadow billing, backups, go-live.

Full design: `C:\Users\Admin\.opencode\plan\isp-billing-blueprint-v1.md`

---

## Requirements

- Node.js 20+ (tested on Node 26)
- npm 10+
- Optional: Docker + PostgreSQL/Redis for production

> This machine currently has no Docker/PostgreSQL. Phase 0 uses SQLite for local development.

---

## Setup

```powershell
cd "D:\LISP PROJECT\isp-billing"
copy .env.example .env
npm install
npm run db:generate
npm run db:push
npm run db:seed
```

The seed prints the super admin **Login ID**, mobile and password. Change the password after first login.

Default development login:

```
Login ID: superadmin
Password: ChangeMe123!
```

New users get their own Login ID when created from **Users & Permissions**. The mobile number still works as a legacy fallback for existing accounts.

### Run

Open two terminals:

```powershell
npm run dev:api     # http://localhost:3001/api/v1
npm run dev:web     # http://localhost:3000
```

Health check: `http://localhost:3001/api/v1/health`

---

## Project structure

```
isp-billing/
  apps/
    api/                  NestJS API (auth, users, settings, upstream status)
    web/                  Next.js UI (login + dashboard shell)
  packages/
    db/                   Prisma schema + seed (SQLite dev)
    adapter-triangle/     Upstream panel adapter skeleton
  infra/                  (reserved)
  docker-compose.yml      Optional PostgreSQL + Redis for production
```

---

## API (Phase 0)

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/auth/login` (loginId + password) | public |
| POST | `/api/v1/auth/refresh` | public |
| POST | `/api/v1/auth/logout` | public |
| GET | `/api/v1/auth/me` | authenticated |
| GET | `/api/v1/users` | `users.manage` |
| POST | `/api/v1/users` | `users.manage` |
| PUT | `/api/v1/users/:id/permissions` | `users.manage` |
| PUT | `/api/v1/users/:id/areas` | `users.manage` |
| PATCH | `/api/v1/users/:id/status` | `users.manage` |
| GET/PUT | `/api/v1/settings/tax` | `settings.tax` |
| GET | `/api/v1/settings/branding/public` | public |
| GET/PUT | `/api/v1/settings/branding` | `settings.branding` |
| GET/PUT | `/api/v1/settings/payment` | `settings.payment` |
| GET/PUT | `/api/v1/settings/sms` | `settings.sms` |
| GET | `/api/v1/upstream/status` | `upstream.manage` |
| POST | `/api/v1/upstream/otp/inbound` | `x-sms-secret` header |
| GET | `/api/v1/upstream/otp/status` | `upstream.manage` |
| GET | `/api/v1/logs/client-logins` | `logs.client_login` |
| GET | `/api/v1/logs/user-logins` | `logs.user_login` |
| GET | `/api/v1/logs/audit` | `logs.audit` |
| GET | `/api/v1/health` | public |

### Phase 1–3 endpoints (implemented)

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/v1/clients` | `clients.view` / `clients.create` |
| GET/PATCH/DELETE | `/api/v1/clients/:id` | `clients.view` / `clients.edit` / `clients.delete` |
| POST | `/api/v1/clients/:id/reveal` | `clients.reveal_credentials` or `clients.view_nid` (checked per field) |
| GET | `/api/v1/clients/:id/login-history` | `clients.view` |
| GET/POST/PATCH | `/api/v1/areas`, `/api/v1/packages` | `areas.*` / `packages.*` |
| GET/POST | `/api/v1/invoices` | `invoices.view` / `invoices.create` |
| GET | `/api/v1/invoices/:id` | `invoices.view` |
| POST | `/api/v1/invoices/:id/waive` / `/send` | `invoices.waive` / `invoices.send` |
| GET/POST | `/api/v1/payments` | `payments.view` / `payments.collect` |
| GET | `/api/v1/payments/unmatched` | `payments.reconcile` |
| POST | `/api/v1/payments/:id/verify` | `payments.verify` |
| POST | `/api/v1/payments/:id/reject` | `payments.reject` |
| POST | `/api/v1/payments/:id/match` | `payments.reconcile` |
| POST | `/api/v1/payments/:id/refund` | `payments.refund` |
| GET | `/api/v1/me/summary` | `portal.view` |
| GET | `/api/v1/me/invoices` / `/payments` | `portal.invoices` / `portal.payments` |
| GET | `/api/v1/me/payment-methods` | `portal.view` |
| POST | `/api/v1/me/payments` | `portal.pay` |
| GET | `/api/v1/reports/collection` / `/due` | `reports.view` |
| GET | `/api/v1/reports/vat` / `/profit` | `reports.financial` |
| GET/PUT | `/api/v1/settings/auto-recharge` | `auto_recharge.toggle` |

Roles seeded: `super_admin`, `admin`, `staff`, `client`.

Permission rules:

- Admin cannot grant a permission they do not have.
- Admin/Staff cannot manage an equal or higher role.
- Staff has **no area restriction** — all areas are visible.
- `clients.reveal_credentials` (PPPoE password) is **ON by default** for Staff; Admin can deny it per user.
- `clients.view_nid` (NID number + photo) is **OFF by default** for Staff; Admin can grant it per user.
- Every PPPoE/NID reveal must be written to the audit log and auto-hidden after 30 seconds.

---

## Database

The Prisma schema is PostgreSQL-ready but uses SQLite for local development.

To switch to PostgreSQL:

1. In `packages/db/prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to a PostgreSQL connection string.
3. Run `npm run db:generate && npm run db:push`.
4. Start PostgreSQL/Redis with `docker compose up -d`.

> Money is stored as integer paisa (`BigInt`). Never use floats for money.

---

## Triangle upstream adapter

`packages/adapter-triangle` contains:

- session cookie jar
- token-bucket rate limiter (default 20 requests/minute)
- login + OTP-required detection
- lock/rate-limit detection
- read stubs for dashboard, clients, packages, areas, login history
- recharge intentionally not implemented until the endpoint is captured

**Important:**

- The upstream panel uses SMS OTP. Unattended automation is not possible without an OTP relay (Telegram planned).
- The panel warns that repeated rate-limit violations can lock the whole panel. Keep one worker, conservative polling, and a kill switch.
- Scraping may violate the upstream provider's terms. Get written permission or at least use a dedicated read-only sub-user.
- Never hardcode or commit upstream credentials.

Smoke test (requires upstream env values):

```powershell
npm run smoke -w @isp/adapter-triangle
```

It prints only `otpRequired`, cookie count and response keys — never credentials or cookies.

---

## Branding

- The software name is **JR COMMUNICATION** by default.
- Super Admin can open **Branding** in the sidebar to:
  - Change the software name
  - Upload a PNG/JPG/SVG logo (max 1 MB)
  - Preview and remove the logo
- Branding is applied to the login page, admin sidebar, demo, and client portal.
- Branding is stored in tenant settings and served through the public `/settings/branding/public` endpoint.
- The logo is saved as a base64 data URL; the API accepts JSON bodies up to 5 MB so a 1 MB image upload is not rejected as "request entity too large".

## Navigation & language

- Sidebar order: **Dashboard → Admin → Staff → Mobile Banking → Clients → Payments → Invoices → Recharge History → Payment Inbox → Wrong Recharge → Packages → Reports → Activity & Logs → Branding → Settings**.
- There are no MAIN / NETWORK / SYSTEM group headings — all items are in one list.
- Menu text and icons are pure white (`#FFFFFF`) for clear contrast on the navy sidebar.
- Every page (login, admin panel, demo and client portal) has a **বাংলা / English** switcher in the top bar. The choice is saved in `localStorage` under `isp_language` and applies to navigation, page titles, buttons, table headers and common labels — including the dashboard and Admin Management sections, both directions.
- Every page also has a **light / dark** theme button. The choice is saved in `localStorage` under `isp_theme`; both themes use the same orange/navy brand palette.
- `apps/web/lib/auto-translate.tsx` bridges older mixed-language labels in both directions (English↔Bangla) without touching forms, code blocks or user data.

## Users, archive & auto User ID

- Creating a user no longer asks for a role: the role comes from the section (Admin tab → admin, Staff tab → staff).
- Every user automatically receives a unique 5-digit **User ID** (`userCode`).
- Each user row has **Edit** (name, Login ID, mobile).
- **Delete is soft**: the user moves to `archived` status. Archived users are hidden from regular admins and only the **Super Admin** sees the Archived list and can restore users.
- The users list has a real-time search bar (User ID, phone, Login ID, name).

## Upstream diagnosis

- `POST /api/v1/upstream/diagnose` (permission `upstream.manage`) checks the Triangle panel: login page structure (status, redirect, size, CAPTCHA/CSRF detection) and a credential login attempt.
- The result is stored in the tenant settings (`upstream_diagnostic`) and an automation job trail — failures are never silent.
- `GET /api/v1/upstream/status` shows the last diagnostic summary.

## Upstream auto sync (scraping)

- `POST /api/v1/upstream/sync` logs in to Triangle and scrapes **packages, areas and clients** into the local database, plus optional per-client login history (`{ "loginHistory": true }`).
- When Triangle requires an OTP, the sync returns immediately with `status: "otp_required"` — the SMS forwarded from the phone automatically completes the flow (verify OTP → save session → scrape → update data). No more long HTTP waits.
- Login attempts are rate-limited by a configurable cooldown (default **5 minutes**, `UPSTREAM_LOGIN_COOLDOWN_MINUTES`) so repeated sync runs never spam OTP SMS to the phone. During the cooldown the top Refresh button is replaced by a live countdown. A **per-tenant sync lock** allows only one run at a time; runs hanging for 10 minutes are auto-failed.
- The scraper uses the panel's real JSON endpoints (`setup/packages`, `setup/areas`, paginated `clients`) and sends the Bearer access token captured after OTP verification. All pages are fetched (per_page=100).
- Existing records are updated by name/mobile/upstreamId; new clients get an auto 4-digit payment code and an active subscription when the package matches.
- Every run stores an `AutomationJob` record with the full report — nothing fails silently.
- Set `TRIANGLE_USERNAME` / `TRIANGLE_PASSWORD` in the environment, and `UPSTREAM_AUTO_SYNC=true` to auto-run the sync on an interval (default 30 minutes, configurable with `UPSTREAM_AUTO_SYNC_INTERVAL_MINUTES`, minimum 1).

## Sync status bar & error log

- A slim status bar sits at the very top of the app for **Super Admin / Admin / Staff** and shows the live step: `Sending OTP… → Verifying OTP & Logging in… → Login Successful → Scraping Data… → Uploading Data… → Finished`, or the failure/stop reason.
- The bar polls `GET /api/v1/sync/status` every 2 seconds while a run is active (15 seconds otherwise).
- Every failure is stored in `SyncError` with the step, error code, message, HTTP status and the upstream response body.
- **Super Admin → Error** menu shows the log with a Copy button that formats the full error for pasting into an AI assistant.
- Error logs are retained for 90 days; the status endpoint is restricted to the three staff roles and the error endpoints to the Super Admin only.
- A 403 "administratively locked" response sets `upstream_lock_until` for 24 hours, blocking new login attempts and showing the lock in the status bar.
- During the login cooldown the top Refresh button is replaced by a **Cooldown m:ss** countdown; clicking Refresh does not create a stuck waiting run.

## OTP request window (5 minutes)

- A fresh upstream login records `OtpWindow.requestedAt` **before** the Triangle OTP request and sets `expiresAt = requestedAt + 5 minutes`.
- A newer Refresh/auto-send that actually requests a new OTP supersedes the old window. Reusing a still-fresh pending login does **not** extend the window.
- An incoming OTP SMS is accepted only when `requestedAt <= smsReceivedAt < expiresAt`. Old, expired, superseded or ambiguous codes are stored in `SmsInbound` with `status = rejected` and a reason (`OTP_TOO_EARLY`, `OTP_EXPIRED`, `OTP_AMBIGUOUS`, `OTP_SUPERSEDED`, ...); they are never sent to Triangle.
- The phone timestamp (`smsReceivedAt`) is used only when its clock is within 90 seconds of the server; otherwise the server receipt time is authoritative. MacroDroid's local `yyyy-MM-dd HH:mm:ss` is interpreted as Asia/Dhaka (UTC+6).
- Duplicate forwarding is prevented by a unique `idempotencyKey` (device + sender + SMS time + body). `bodyHash` is **not** unique, so a re-sent OTP with the same text can still be accepted in a later window.
- The top status bar shows the remaining window time (`Time left m:ss`). Ambiguous messages (for example an ID and an OTP in the same SMS) are rejected instead of guessed.

## AI SMS classifier (optional)

- The webhook can run an AI first pass (`AI_PROVIDER=gemini|openai|deepseek|opencode-go|opencode`)
  to classify `UPSTREAM_OTP`, `BKASH`, `NAGAD`, `ROCKET` or `OTHER` and extract
  only the OTP. See `docs/ai-sms-classifier.md` for the prompt, schema, env
  vars and failure handling.
- The AI is untrusted: the server verifies the OTP is 4–8 alphanumeric
  characters, appears as a standalone token in the SMS, and meets
  `AI_MIN_CONFIDENCE`. Otherwise the deterministic parser is used.
- AI never bypasses the 5-minute `OtpWindow`, never logs in on its own, and a
  bKash/Nagad/Rocket OTP can never complete an upstream login.
- Without `AI_API_KEY` (or with `AI_CLASSIFIER_ENABLED=false`) the system works
  exactly as before using only the deterministic parser.

## SMS forwarding & automated OTP

- See `docs/sms-forwarding-setup.md` for the phone → server setup (endpoint, HMAC signature, replay protection).
- OTP SMS is stored encrypted with a 5-minute expiry and single-use semantics; `GET /api/v1/upstream/otp/latest` (Super Admin) shows the latest pending OTP.

## Mobile Banking, 4-digit reference & Wrong Recharge

- **Mobile Banking** menu (Super Admin): bKash, Nagad, Rocket — each with Merchant and Personal accounts, separate active toggles.
- **Merchant** is used for API/automated and manual `Payment`.
- **Personal** is used for manual `Send Money` (staff verifies from the statement).
- Each client receives a unique **4-digit payment code** (`paymentCode`) used as the reference.
- Manual client payments do **not require a Trx ID**; sender number, amount, paid time and reference are stored.
- A wrong/mismatched reference creates an `unmatched` payment.
- **Wrong Recharge** menu shows the review queue and allows:
  - Search client by name / mobile / 4-digit code
  - Apply the existing wrong-reference payment to the correct client/invoice
  - Manual cash/bKash recharge with auto-calculated amount
  - Verify → invoice paid → ledger → auto-recharge job
- Every match / override / recharge is audit-logged.

## Daily billing & profit

- Each client has a monthly bill (package price or manual override).
- Daily rate = monthly bill ÷ 30 (paisa, rounded up).
- A payment buys `ceil(payment ÷ daily rate)` days; extra payment buys extra days.
- The recharge job stores `durationDays`, upstream cost and payment reference.
- The Triangle adapter receives the duration selected from: 1, 2, 3, 7, 10, 15, 20, 30 days or a custom range.
- Profit = (verified payments − VAT) − recharge upstream cost.
- Profit is visible only with `reports.profit` (Super Admin by default).
- Upstream package cost is visible only with `packages.view_cost`.

## Recharge history

- **Recharge History** menu shows every recharge job with client, invoice, days, amount, upstream cost, provider, status and payment reference.
- **Debit / Credit** tab shows the ledger entries created by payments and refunds.
- Both can be filtered by client, date range and status; Admin and Super Admin have access by default.
- Existing ledger rows can be linked to clients with `npm run db:backfill` (one-time migration for older data).

## Users, soft delete & logs

- Super Admin has an **Admin** menu; Admin and Super Admin have a **Staff** menu.
- Admin cannot see other admins.
- Delete is a **soft delete**: login is blocked, history and audit remain.
- Activity logs have three tabs:
  - Client portal logins (`logs.client_login`)
  - User logins (`logs.user_login`)
  - Change audit (`logs.audit`)
- Admin sees Staff/Client actions, never Super Admin actions.
- Staff sees only its own actions.
- Logs are retained for **1 year** (365 days) and cleaned automatically.

## Forgot password (OTP)

- Login screen has a **Forgot password?** link that opens a 3-step flow: identifier → OTP → new password.
- Endpoints: `POST /auth/forgot-password/request`, `/verify`, `/reset`.
- OTPs are hashed (SHA-256) and stored in `OtpRequest` with a 5-minute expiry; a reset token (JWT, 10 min) is issued after verification and all refresh tokens are revoked when the password changes.
- The OTP is returned in `devOtp` only outside production (`NODE_ENV !== 'production'`) so the flow can be tested locally. In production the OTP is never exposed — a real SMS gateway must deliver it.
- Password hashing: bcrypt cost 12.

## SMS payment inbox (automated payments)

An Android phone (SMS forwarder or custom app) forwards incoming payment SMS to:

```
POST /api/v1/webhooks/sms
Header: x-sms-secret: <SMS_FORWARD_SECRET>
Body: { "sender": "bKash", "message": "You have received Tk 250.00 from 01712345678. Trx ID ABC123XY. Ref 1000." }
```

- The API classifies the SMS as `payment`, `otp` or `unknown` and stores raw text in `SmsInbound` (duplicate-protected by a stable `idempotencyKey`).
- Payment SMS is parsed for amount, Trx ID, reference and sender mobile.
- A client is matched by the 4-digit payment code first, then by sender mobile number.
- Matching payments are created with `channel=sms` and, when enabled, verified automatically (invoice + ledger + recharge job). Mismatches go to **Wrong Recharge** via a reconciliation issue.
- OTP SMS is forwarded to the upstream OTP store used by the Triangle login worker.
- **Payment Inbox** page (Admin/Super Admin) shows all raw SMS and parse results.
- Auto-verify can be tuned with settings `sms_auto_verify_enabled` and `sms_auto_verify_max_paisa`.
- The `x-sms-secret` header is mandatory; requests without it get 401. Add per-device tokens + HMAC when the custom Android app is introduced.

## Triangle OTP relay

An Android SMS forwarder can POST the incoming SMS to:

```
POST /api/v1/upstream/otp/inbound
Header: x-sms-secret: <SMS_FORWARD_SECRET>
Body: { "message": "Your OTP is 123456" }
```

The API extracts the OTP, checks it against the active 5-minute `OtpWindow`, and only then stores an encrypted `OtpRequest` and starts verification.
The worker must still use a long-lived encrypted session; avoid re-login every few minutes because repeated logins trigger the upstream rate-limit lock.

## Security notes

- Change all secrets in `.env` before production.
- Passwords use bcrypt (cost 12). Upgrade path: Argon2id.
- Refresh tokens are hashed (SHA-256) and rotated on refresh.
- SMS API keys are encrypted with AES-256-GCM (`SETTINGS_KEY`).
- Phase 0 stores JWTs in `localStorage` for speed; production should move to httpOnly cookies.
- Do not store bKash PIN/OTP. Trx IDs are unique per tenant.

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, schema, auth/RBAC, settings, adapter, login UI | ✅ Complete |
| 1 | Clients, packages, areas, sensitive reveal + audit, client portal APIs | ✅ Backend core |
| 2 | Invoices + VAT, bKash verification, ledger, reports | ✅ Backend core |
| 3 | Auto-recharge queue, Super Admin toggle, approval threshold | ✅ Backend core |
| 4 | Hardening, backups, shadow billing, go-live | ⏳ Pending |

**Still pending for production:** live Triangle client sync + recharge worker (needs OTP relay/session), real bKash gateway or statement reconciliation, invoice PDF/SMS delivery, and wiring the demo frontend to live API data.
