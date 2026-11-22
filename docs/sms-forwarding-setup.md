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
  "sender": "Triangle",
  "message": "Your login OTP is 123456",
  "receivedAt": "2026-11-22T06:00:00.000Z"
}
```

The message may also be sent as `body` or `text`. For payment SMS the parser
extracts amount, Trx ID, reference and sender number automatically.

## 2. Signature calculation (recommended)

```
bodyHash   = SHA256(sender + "|" + message + "|" + receivedAt)   (raw values as sent)
signature  = HMAC_SHA256(secret, timestamp + "." + nonce + "." + bodyHash)   (hex)
```

The server rejects signatures whose timestamp is older than 5 minutes or whose
nonce was already seen (409/401). Without a signature, only the shared secret
header is checked.

## 3. Setting up the phone (no custom app yet)

Use any Android SMS forwarder and point it at the endpoint:

- **SMS Forwarder** (Android app): add a rule — sender contains "Triangle"
  (or "bKash", "Nagad", "Rocket") → POST JSON to the webhook URL with a custom
  header `x-sms-secret: <your secret>`.
- **Tasker / MacroDroid**: SMS Received event → HTTP Request action with the
  JSON body above.
- Later: a dedicated companion app with device tokens + signature will replace
  this setup.

Phone requirements: Android, always on, internet connected, battery
optimization disabled for the forwarder app.

## 4. Server-side OTP handling

- Incoming OTP SMS is stored as `SmsInbound` (kind `otp`) and as an
  `OtpRequest` (context `triangle_login`) with an **encrypted** code, SHA-256
  hash and **5-minute expiry**.
- Authorized managers can inspect the latest OTP with:
  `GET /api/v1/upstream/otp/latest` (permission `upstream.manage`).
- The Triangle login worker consumes the OTP once (single-use) and never
  re-logins unnecessarily (avoids panel lock).

## 5. Security notes

- Change `SMS_FORWARD_SECRET` before production.
- Keep the endpoint HTTPS-only.
- Never store OTPs longer than 5 minutes; mark consumed after use.
- The raw SMS body is retained per the retention policy and is masked in the UI.
