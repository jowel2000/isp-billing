import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SmsAiCategory = 'UPSTREAM_OTP' | 'BKASH' | 'NAGAD' | 'ROCKET' | 'OTHER';

export interface SmsAiClassification {
  category: SmsAiCategory;
  isOtp: boolean;
  otp: string | null;
  confidence: number;
  reason: string;
  provider: string;
  model: string | null;
  /** True when the caller should use the deterministic parser instead. */
  fallback: boolean;
  error?: string;
}

export interface ValidatedAiResult {
  category: SmsAiCategory;
  isOtp: boolean;
  otp: string | null;
  confidence: number;
  reason: string;
  fallback: boolean;
}

const CATEGORY_MAP: Record<string, SmsAiCategory> = {
  UPSTREAM_OTP: 'UPSTREAM_OTP',
  UPSTREAM: 'UPSTREAM_OTP',
  OTP: 'UPSTREAM_OTP',
  LOGIN_OTP: 'UPSTREAM_OTP',
  LOGIN: 'UPSTREAM_OTP',
  BKASH: 'BKASH',
  B_KASH: 'BKASH',
  NAGAD: 'NAGAD',
  ROCKET: 'ROCKET',
  DBBL: 'ROCKET',
  OTHER: 'OTHER',
};

const OTP_PATTERN = /^[A-Z0-9]{4,8}$/;

const BANGLA_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

function normalizeDigits(value: string): string {
  return value
    .replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit)
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

function normalizeCategory(value: unknown): SmsAiCategory {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, '');
  const mapped = CATEGORY_MAP[raw];
  if (mapped) return mapped;

  const compact = raw.replace(/_/g, '');
  if (compact.includes('UPSTREAM') && compact.includes('OTP')) return 'UPSTREAM_OTP';
  if (compact.includes('BKASH')) return 'BKASH';
  if (compact.includes('NAGAD')) return 'NAGAD';
  if (compact.includes('ROCKET') || compact.includes('DBBL')) return 'ROCKET';
  return 'OTHER';
}

function clampConfidence(value: unknown): number {
  let number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 1 && number <= 100) number /= 100;
  return Math.min(1, Math.max(0, number));
}

function text(value: unknown, max = 300): string {
  return String(value ?? '').trim().slice(0, max);
}

/** Returns the OTP only when it is a plausible code that exists in the SMS. */
function normalizeOtp(value: unknown, body: string): string | null {
  if (value === null || value === undefined) return null;
  const candidate = normalizeDigits(String(value))
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!OTP_PATTERN.test(candidate)) return null;
  if (!/[0-9]/.test(candidate)) return null;

  const upper = normalizeDigits(body).toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const standalone = new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`);
  if (!standalone.test(upper) && !standalone.test(compact)) return null;

  return candidate;
}

/**
 * Validates the model output before it can ever reach the upstream login.
 * The AI is untrusted: it must return a category, and any OTP must be a
 * 4–8 character alphanumeric code that appears verbatim in the original SMS.
 */
export function sanitizeAiResult(
  raw: unknown,
  body: string,
  minConfidence: number,
): ValidatedAiResult {
  if (!raw || typeof raw !== 'object') {
    return {
      category: 'OTHER',
      isOtp: false,
      otp: null,
      confidence: 0,
      reason: 'AI returned an invalid response',
      fallback: true,
    };
  }

  const record = raw as Record<string, unknown>;
  const category = normalizeCategory(record.category);
  const confidence = clampConfidence(record.confidence);
  const reason = text(record.reason ?? '');
  const claimedOtp =
    record.otp ?? record.otp_code ?? record.otpCode ?? record.code ?? null;

  if (category === 'BKASH' || category === 'NAGAD' || category === 'ROCKET') {
    return {
      category,
      isOtp: false,
      otp: null,
      confidence,
      reason: reason || `${category} message — no upstream login OTP`,
      fallback: false,
    };
  }

  if (category === 'OTHER') {
    return {
      category,
      isOtp: false,
      otp: null,
      confidence,
      reason: reason || 'Not an upstream OTP',
      fallback: false,
    };
  }

  // Category is UPSTREAM_OTP from here.
  const isOtpFlag = record.is_otp ?? record.isOtp;
  const explicitlyNotOtp =
    isOtpFlag === false ||
    String(isOtpFlag ?? '').trim().toLowerCase() === 'false';

  if (explicitlyNotOtp) {
    return {
      category,
      isOtp: false,
      otp: null,
      confidence,
      reason: reason || 'AI marked this as not an OTP',
      fallback: true,
    };
  }

  if (confidence < minConfidence) {
    return {
      category,
      isOtp: false,
      otp: null,
      confidence,
      reason: `AI confidence ${confidence.toFixed(2)} below ${minConfidence.toFixed(2)}`,
      fallback: true,
    };
  }

  const otp = normalizeOtp(claimedOtp, body);
  if (!otp) {
    return {
      category,
      isOtp: false,
      otp: null,
      confidence,
      reason: reason || 'AI OTP was missing, ambiguous, or not present in the SMS',
      fallback: true,
    };
  }

  return {
    category,
    isOtp: true,
    otp,
    confidence,
    reason: reason || 'Upstream login OTP',
    fallback: false,
  };
}

function extractJson(textResponse: string): unknown {
  const cleaned = textResponse
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI response did not contain a JSON object');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

@Injectable()
export class SmsAiClassifierService {
  private readonly logger = new Logger('SmsAiClassifier');

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.settings().enabled;
  }

  private settings() {
    const provider = (this.config.get<string>('AI_PROVIDER') || 'gemini')
      .trim()
      .toLowerCase();

    const key =
      this.config.get<string>('AI_API_KEY') ||
      (provider === 'gemini'
        ? this.config.get<string>('GEMINI_API_KEY')
        : provider === 'openai'
          ? this.config.get<string>('OPENAI_API_KEY')
          : provider === 'deepseek'
            ? this.config.get<string>('DEEPSEEK_API_KEY')
            : '') ||
      '';

    const explicitlyDisabled = ['false', '0', 'no', 'off'].includes(
      (this.config.get<string>('AI_CLASSIFIER_ENABLED') || '')
        .trim()
        .toLowerCase(),
    );
    const enabled =
      !explicitlyDisabled &&
      provider !== 'none' &&
      provider !== 'disabled' &&
      Boolean(key);

    const defaults: Record<string, string> = {
      gemini: 'gemini-2.0-flash',
      openai: 'gpt-4o-mini',
      deepseek: 'deepseek-chat',
    };

    const model =
      this.config.get<string>('AI_MODEL') || defaults[provider] || 'gemini-2.0-flash';

    const baseUrl = (
      this.config.get<string>('AI_BASE_URL') ||
      (provider === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : provider === 'deepseek'
          ? 'https://api.deepseek.com'
          : 'https://api.openai.com')
    ).replace(/\/+$/, '');

    const timeoutMsRaw = Number(this.config.get<string>('AI_TIMEOUT_MS'));
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 1000
        ? Math.min(timeoutMsRaw, 20_000)
        : 5_000;

    const minConfidenceRaw = Number(this.config.get<string>('AI_MIN_CONFIDENCE'));
    const minConfidence =
      Number.isFinite(minConfidenceRaw) && minConfidenceRaw >= 0 && minConfidenceRaw <= 1
        ? minConfidenceRaw
        : 0.65;

    const panelName =
      this.config.get<string>('UPSTREAM_PANEL_NAME') || 'Triangle';

    return {
      provider,
      key,
      enabled,
      model,
      baseUrl,
      timeoutMs,
      minConfidence,
      panelName,
    };
  }

  private prompt(sender: string | null, body: string, panelName: string) {
    return `You are an SMS classifier for an ISP billing system. The SMS is forwarded unmodified from the operator's phone.

Upstream ISP panel: ${panelName}

Categories:
- UPSTREAM_OTP: a login, sign-in, verification, or one-time password for the upstream ISP panel.
- BKASH: bKash transaction, payment, cash-in, cash-out, balance, or bKash verification code.
- NAGAD: Nagad transaction, payment, balance, or Nagad verification code.
- ROCKET: Rocket (DBBL) transaction, payment, balance, or Rocket verification code.
- OTHER: promotional, informational, or unrelated SMS.

Rules:
1. A bKash/Nagad/Rocket OTP is NOT an upstream OTP. Classify it as that MFS category.
2. For UPSTREAM_OTP, extract ONLY the exact login/verification code (4-8 letters/digits). Ignore account/ID numbers, Trx IDs, reference numbers, phone/wallet numbers, amounts, dates, and expiry durations.
3. The extracted OTP must appear verbatim in the SMS. If there are multiple possible codes or you are unsure, return is_otp=false and otp=null.
4. The SMS may be in English, Bengali, or Banglish. Bengali digits must be understood (e.g. ১২৩৪৫৬).
5. Return confidence 0.0-1.0.

Return ONLY this JSON object (no markdown, no extra text):
{"category":"UPSTREAM_OTP|BKASH|NAGAD|ROCKET|OTHER","is_otp":true|false,"otp":"code or null","confidence":0.0,"reason":"brief explanation"}

Examples:
- Sender: UpstreamAuth | "Your login verification code is 489210." -> {"category":"UPSTREAM_OTP","is_otp":true,"otp":"489210","confidence":0.99,"reason":"login verification code"}
- Sender: LISP | "Your ID is 123456 and your one time password is 654321." -> {"category":"UPSTREAM_OTP","is_otp":true,"otp":"654321","confidence":0.98,"reason":"one time password, ID ignored"}
- Sender: bKash | "You have received Tk 250.00 from 01712345678. Trx ID ABC123XY. Ref 1000." -> {"category":"BKASH","is_otp":false,"otp":null,"confidence":0.99,"reason":"bKash payment"}
- Sender: bKash | "Your bKash verification code is 123456." -> {"category":"BKASH","is_otp":false,"otp":null,"confidence":0.99,"reason":"bKash code, not upstream"}
- Sender: 01339912544 | "আপনার OTP হলো ১২৩৪৫৬" -> {"category":"UPSTREAM_OTP","is_otp":true,"otp":"123456","confidence":0.97,"reason":"Bengali OTP"}

SMS sender: ${sender ?? 'unknown'}
SMS text:
${body}`;
  }

  private async callGemini(
    baseUrl: string,
    model: string,
    key: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
  }

  private async callOpenAiCompatible(
    baseUrl: string,
    model: string,
    key: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict SMS classifier. Return only valid JSON matching the requested schema.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`AI HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Returns null when AI classification is disabled/not configured; the
   * caller then uses the deterministic parser. On any failure, returns a
   * fallback result with the error so the caller can still process the SMS.
   */
  async classify(input: {
    sender: string | null;
    body: string;
  }): Promise<SmsAiClassification | null> {
    const settings = this.settings();
    if (!settings.enabled) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    const prompt = this.prompt(input.sender, input.body, settings.panelName);

    try {
      const rawText =
        settings.provider === 'gemini'
          ? await this.callGemini(
              settings.baseUrl,
              settings.model,
              settings.key,
              prompt,
              controller.signal,
            )
          : await this.callOpenAiCompatible(
              settings.baseUrl,
              settings.model,
              settings.key,
              prompt,
              controller.signal,
            );

      const raw = extractJson(rawText);
      const validated = sanitizeAiResult(raw, input.body, settings.minConfidence);

      return {
        ...validated,
        provider: settings.provider,
        model: settings.model,
      };
    } catch (error) {
      const message = (error as Error)?.message || 'AI classification failed';
      this.logger.warn(`AI classifier failed: ${message}`);

      return {
        category: 'OTHER',
        isOtp: false,
        otp: null,
        confidence: 0,
        reason: 'AI unavailable — deterministic classifier used',
        provider: settings.provider,
        model: settings.model,
        fallback: true,
        error: message.slice(0, 300),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
