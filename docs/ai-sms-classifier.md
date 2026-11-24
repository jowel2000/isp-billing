# AI SMS Classifier (optional first pass)

The webhook always works without AI. When AI is configured, it runs first and
the deterministic parser remains the fallback. The AI can never log in to the
upstream panel by itself: its output is validated, the 5-minute OTP window is
checked, and only then is the OTP passed to the Triangle login service.

## 1. Configuration

```env
# Enable/disable AI (default: enabled when a key is present)
AI_CLASSIFIER_ENABLED=true

# gemini | openai | deepseek | none
AI_PROVIDER=gemini

# Provider key (or GEMINI_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY)
AI_API_KEY=...

# Optional model override
AI_MODEL=gemini-2.0-flash

# Optional base URL (OpenAI-compatible proxy / mock server)
# AI_BASE_URL=https://api.openai.com

# Request timeout and minimum confidence
AI_TIMEOUT_MS=5000
AI_MIN_CONFIDENCE=0.65

# Shown to the model as the expected upstream panel
UPSTREAM_PANEL_NAME=Triangle
```

Without a key (or with `AI_CLASSIFIER_ENABLED=false`) the server uses only the
deterministic parser and does not make any external AI request.

> Privacy: the raw SMS (which may contain an OTP) is sent to the configured AI
> provider. Disable AI if that is not acceptable. OTPs are short-lived and the
> provider key is never logged.

## 2. AI prompt (system + user)

The service sends this prompt (see `sms-ai-classifier.service.ts`):

```text
You are an SMS classifier for an ISP billing system. The SMS is forwarded
unmodified from the operator's phone.

Upstream ISP panel: {panelName}

Categories:
- UPSTREAM_OTP: login/sign-in/verification OTP for the upstream ISP panel.
- BKASH / NAGAD / ROCKET: MFS transaction, payment, balance or MFS OTP.
- OTHER: promotional, informational or unrelated.

Rules:
1. A bKash/Nagad/Rocket OTP is NOT an upstream OTP.
2. For UPSTREAM_OTP extract ONLY the exact 4-8 character login/verification
   code. Ignore IDs, Trx IDs, references, phone/wallet numbers, amounts,
   dates and expiry durations.
3. The OTP must appear verbatim in the SMS. If there are multiple candidates
   or you are unsure, return is_otp=false and otp=null.
4. Understand English, Bengali and Banglish (including Bengali digits).
5. confidence is 0.0-1.0.

Return ONLY:
{"category":"UPSTREAM_OTP|BKASH|NAGAD|ROCKET|OTHER",
 "is_otp":true|false,
 "otp":"code or null",
 "confidence":0.0,
 "reason":"brief explanation"}
```

## 3. Structured output schema

```json
{
  "category": "UPSTREAM_OTP | BKASH | NAGAD | ROCKET | OTHER",
  "is_otp": true,
  "otp": "489210",
  "confidence": 0.99,
  "reason": "login verification code"
}
```

The server validates:
- `category` is one of the five values;
- for `UPSTREAM_OTP`, `is_otp=true` and `otp` is 4-8 alphanumeric characters
  with at least one digit;
- the OTP appears as a standalone token in the raw SMS (not a substring of an
  ID/phone/Trx ID);
- `confidence >= AI_MIN_CONFIDENCE`.

If any check fails, AI is ignored and the deterministic parser runs. The AI
response is stored on `SmsInbound` (`aiCategory`, `aiConfidence`, `aiProvider`,
`aiModel`, `aiReason`).

## 4. Decision flow

```text
SMS webhook
  -> store idempotency + timestamps
  -> AI classify (if configured; timeout -> deterministic)
  -> if AI says BKASH/NAGAD/ROCKET: force non-upstream; payment/log handler
  -> if AI says UPSTREAM_OTP and validates: use that OTP
  -> otherwise: deterministic parser (keyword/ID/Bengali/ambiguity rules)
  -> if OTP: require active OtpWindow (5 minutes)
       -> claim window -> verify Triangle -> consume -> scrape/sync
  -> if payment: existing payment inbox / ledger / recharge flow
  -> if other: store/ignore
```

## 5. MacroDroid setup

```
POST https://<api-host>/api/v1/webhooks/sms
Header: x-sms-secret: <SMS_FORWARD_SECRET>
Content-Type: application/json
```

Body (Magic Text tokens inserted with the `...` button — do not type them):

```json
{
  "deviceId": "redmi-note-14-pro-5g",
  "sender": "{sms_number}",
  "message": "{sms_message}",
  "smsReceivedAt": "{sms_received_time}"
}
```

Aliases `message_body` and `received_at` are also accepted.

If the SMS contains quotes/newlines and JSON breaks, use:

```
Content-Type: application/x-www-form-urlencoded

sender={sms_number}&message={sms_message}&deviceId=redmi-note-14-pro-5g&smsReceivedAt={sms_received_time}
```

## 6. Failure handling

| Failure | Behavior |
|---|---|
| AI disabled / no key | Deterministic parser only |
| AI timeout / HTTP error | Deterministic parser; `aiCategory=ERROR` |
| AI invalid JSON | Deterministic parser; AI ignored |
| AI OTP not in SMS / ambiguous | Deterministic parser; AI ignored |
| AI confidence too low | Deterministic parser; AI ignored |
| AI says MFS | Upstream login is never attempted |
| No/expired OTP window | SMS stored as `rejected`; no upstream call |
| Triangle 511 | OtpWindow `failed`; new Refresh required |
| Triangle transient/5xx | One retry, then failed/released |

## 7. Session state mapping

| Requirement | Implementation |
|---|---|
| `WAITING_FOR_OTP` | `OtpWindow.status = pending` + `UpstreamSession.status = pending_otp` |
| `LOGGED_IN` | `OtpWindow.status = consumed` + `UpstreamSession.status = active` |
| Expired | `OtpWindow.status = expired`; no upstream login |
| Superseded | `OtpWindow.status = superseded`; old OTP never reused |
| Failed | `OtpWindow.status = failed`; new Refresh required |

The `OtpWindow` row is the authoritative 5-minute timer. `otp_requested_at` is
`requestedAt`; `expires_at` is `expiresAt`. A duplicate login is prevented by
the atomic `pending -> verifying -> consumed` transition, so one OTP can only
produce one upstream session.
