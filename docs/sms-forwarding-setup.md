# Phone → Server SMS Forwarding (Automated OTP Login)

The JR COMMUNICATION panel can receive SMS directly from your Android phone so
that OTP codes (and payment SMS) are processed automatically by the server.

## 1. Endpoint

```
POST https://<your-api-host>/api/v1/webhooks/sms
```

Headers:

| Header | Required | Purpose |
|---|---|---|
| `x-sms-secret` | Yes (unless signature is used) | Shared secret (`SMS_FORWARD_SECRET`) |
| `x-sms-signature` | With timestamp+nonce | HMAC-SHA256 signature (stronger) |
| `x-sms-timestamp` | With signature | Unix milliseconds, must be within ±5 min |
| `x-sms-nonce` | With signature | Unique value per SMS, single-use (replay protection) |

Body (JSON):

```json
{
  "deviceId": "redmi-note-14-pro-5g",
  "sender": "Triangle",
  "message": "Your login OTP is 123456",
  "smsReceivedAt": "2026-11-22T06:00:00.000Z",
  "idempotencyKey": "optional-stable-per-sms-key"
}
```

- `smsReceivedAt` is the phone's SMS arrival time. ISO-8601 with `Z`/offset is
  preferred. MacroDroid's local `yyyy-MM-dd HH:mm:ss` is interpreted as
  Asia/Dhaka (UTC+6).
- `message_body` and `received_at` are accepted as aliases for `message` and
  `smsReceivedAt` (for generic forwarders).
- `idempotencyKey` is optional; when omitted the server builds one from
  `deviceId + sender + smsReceivedAt + message`.
- `receivedAt` is still accepted for backward compatibility.
- The message may also be sent as `body` or `text`. For payment SMS the parser
  extracts amount, Trx ID, reference and sender number automatically.
- If AI classification is configured, it runs first; see
  `docs/ai-sms-classifier.md`. Without an AI key the deterministic parser is
  the only classifier.

## 2. OTP request window (5 minutes)

- Starting a fresh Triangle login records `OtpWindow.requestedAt` before the
  OTP request and sets `expiresAt = requestedAt + 5 minutes`.
- An OTP SMS is accepted only when
  `requestedAt <= smsReceivedAt < expiresAt`.
- Old SMS (`OTP_TOO_EARLY`), expired SMS (`OTP_EXPIRED`), a second SMS while
  verification is running (`OTP_ALREADY_CLAIMED`), a superseded request
  (`OTP_SUPERSEDED`) and ambiguous codes (`OTP_AMBIGUOUS`) are stored as
  `SmsInbound.status = rejected` and are **never** sent to Triangle.
- If the phone clock differs from the server by more than 90 seconds, the
  server receipt time is used instead of `smsReceivedAt`.
- Duplicate forwarding is safe: the unique `idempotencyKey` returns the original
  result with `duplicate: true`.
- A rejected OTP does not consume the window; a new Refresh can request a new
  OTP. An accepted OTP is consumed atomically before the session is saved.

## 3. Signature calculation (recommended)

```
bodyHash   = SHA256(sender + "|" + message + "|" + (smsReceivedAt ?? receivedAt ?? ""))
signature  = HMAC_SHA256(secret, timestamp + "." + nonce + "." + bodyHash)   (hex)
```

The server rejects signatures whose timestamp is older than 5 minutes or whose
nonce was already seen (409/401). Without a signature, only the shared secret
header is checked.

## 4. Setting up the phone (no custom app yet)

Use any Android SMS forwarder and point it at the endpoint:

- **SMS Forwarder** (Android app): add a rule — sender contains "Triangle"
  (or the Triangle OTP number `09612770444`) or "bKash", "Nagad", "Rocket" →
  POST JSON to the webhook URL with a custom header
  `x-sms-secret: <your secret>`.
- **Tasker / MacroDroid**: SMS Received event → HTTP Request action with the
  JSON body above.
- Later: a dedicated companion app with device tokens + signature will replace
  this setup.

Phone requirements: Android, always on, internet connected, battery
optimization disabled for the forwarder app.

Triangle specifics (confirmed with the ISP):
- OTP sender number: **09612770444** (may arrive as `+8809612770444`).
- OTP length: **6 digits**.
- The server classifies any 6-digit OTP SMS from that number as a Triangle
  OTP even when the text has no "OTP" keyword.
- **OTP-only rule:** messages from `09612770444` are never treated as
  payments — only OTPs are accepted from that number.
- **Block rule:** messages containing a `pmt` marker (e.g. `pmt#123456`) are
  ignored completely — never processed as OTP or payment.

## 5. Server-side OTP handling

- Incoming OTP SMS is stored as `SmsInbound` (kind `otp`) and as an
  `OtpRequest` (context `triangle_login`) with an **encrypted** code, SHA-256
  hash and **5-minute expiry**.
- Authorized managers can inspect the latest OTP with:
  `GET /api/v1/upstream/otp/latest` (permission `upstream.manage`).
- The Triangle login worker consumes the OTP once (single-use) and never
  re-logins unnecessarily (avoids panel lock).

## 6. Security notes

- Change `SMS_FORWARD_SECRET` before production.
- Keep the endpoint HTTPS-only.
- Never store OTPs longer than 5 minutes; mark consumed after use.
- The raw SMS body is retained per the retention policy and is masked in the UI.
