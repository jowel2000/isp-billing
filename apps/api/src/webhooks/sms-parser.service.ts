import { Injectable } from '@nestjs/common';

export interface ParsedSms {
  kind: 'payment' | 'otp' | 'unknown';
  provider: string | null;
  amountPaisa: number | null;
  trxId: string | null;
  referenceCode: string | null;
  senderMobile: string | null;
  otpCode: string | null;
  otpLike?: boolean;
  otpReason?: string;
  otpCandidates?: string[];
  blocked?: string;
}

interface OtpExtraction {
  code: string | null;
  reason?: 'OTP_NOT_FOUND' | 'OTP_AMBIGUOUS';
  candidates?: string[];
  confidence?: 'high' | 'low';
}

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

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit)
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/[‐‑‒–—−]/g, '-');
}

function firstMatch(source: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/**
 * Triangle sends both a 6-digit account/ID and a 6-digit OTP. The code next
 * to an OTP keyword wins; a lone plausible candidate is accepted as a
 * low-confidence fallback. Two or more candidates are never guessed.
 */
const OTP_KEYWORD = String.raw`(?:otp|o\.?t\.?p|one[\s-]*time(?:\s*(?:password|passcode|code|pin))?|verification\s*(?:code|pin)|login\s*(?:code|otp)|passcode|পাসওয়ার্ড|কোড|ওটিপি|যাচাই)`;

const OTP_KEYWORD_RE = new RegExp(OTP_KEYWORD, 'iu');
const OTP_NEAR = new RegExp(
  `${OTP_KEYWORD}[^0-9]{0,40}?(?=[A-Z0-9]*\\d)([A-Z0-9]{4,8})(?![A-Z0-9])`,
  'iu',
);

// 4–8 alphanumeric characters, at least one digit, not part of a longer token.
const OTP_ANY = /(?<![A-Z0-9])(?=[A-Z0-9]*\d)[A-Z0-9]{4,8}(?![A-Z0-9])/gi;
const OTP_SEPARATED = /(?<!\d)(\d{3})[ -](\d{3})(?!\d)/;

function isYear(code: string): boolean {
  return /^(19|20)\d{2}$/.test(code);
}

function isAmountNear(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 32), index);
  return /(?:BDT|Tk\.?|৳|amount|টাকা|paid|payment)\s*$/i.test(before);
}

function isPmtNear(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 16), index);
  return /(?:^|\s)pmt\s*#?\s*$/i.test(before);
}

export function extractOtpCode(body: string): OtpExtraction {
  const text = normalize(body ?? '');

  // 1) Code immediately after an OTP keyword wins (handles ID + OTP messages).
  const near = OTP_NEAR.exec(text);
  if (near?.[1]) {
    const code = near[1].toUpperCase();
    const codeIndex = (near.index ?? 0) + near[0].lastIndexOf(near[1]);
    if (!isYear(code) && !isAmountNear(text, codeIndex) && !isPmtNear(text, codeIndex)) {
      return { code, confidence: 'high' };
    }
  }

  // 2) Separated digits near a keyword: "123 456" / "123-456".
  if (OTP_KEYWORD_RE.test(text)) {
    const separated = text.match(OTP_SEPARATED);
    if (separated) {
      const code = `${separated[1]}${separated[2]}`;
      if (!isYear(code)) return { code, confidence: 'high' };
    }
  }

  // 3) Exactly one plausible standalone candidate -> low confidence.
  const candidates = [...text.matchAll(OTP_ANY)]
    .map((match) => ({
      code: match[0].toUpperCase(),
      index: match.index ?? 0,
    }))
    .filter(
      (candidate) =>
        !isYear(candidate.code) &&
        !isAmountNear(text, candidate.index) &&
        !isPmtNear(text, candidate.index),
    )
    .map((candidate) => candidate.code);

  const unique = [...new Set(candidates)];
  if (unique.length === 1) {
    return { code: unique[0], confidence: 'low' };
  }
  if (unique.length > 1) {
    return { code: null, reason: 'OTP_AMBIGUOUS', candidates: unique };
  }
  return { code: null, reason: 'OTP_NOT_FOUND' };
}

/**
 * Triangle sends its OTP from 09612770444 (user-confirmed). The number may
 * arrive with or without the country prefix.
 */
const TRIANGLE_SENDER_TAIL = '9612770444';

function isTriangleSender(sender: string): boolean {
  const digits = sender.replace(/\D/g, '');
  return digits === TRIANGLE_SENDER_TAIL || digits.endsWith(TRIANGLE_SENDER_TAIL);
}

@Injectable()
export class SmsParserService {
  parse(
    rawBody: string,
    rawSender: string | null | undefined,
    otpWindowActive = false,
  ): ParsedSms {
    const body = normalize(rawBody ?? '');
    const sender = normalize(rawSender ?? '');
    const source = `${sender} ${body}`;

    // Block rule: messages that look like a payment marker ("pmt#123456" or
    // "pmt 123456") are never processed — not as OTP, not as payment.
    if (/\bpmt\s*#?\s*\d{4,8}\b/i.test(body) || /\bpmt\b/i.test(body)) {
      return {
        kind: 'unknown',
        provider: null,
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode: null,
        blocked: 'pmt-marker',
      };
    }

    const extraction = extractOtpCode(body);
    const looksLikeOtp =
      isTriangleSender(sender) ||
      /(otp|verification code|one[\s-]*time|triangle|পাসওয়ার্ড|কোড|ওটিপি|যাচাই)/i.test(
        source,
      );
    const otpContext = looksLikeOtp || otpWindowActive;

    const triangle = isTriangleSender(sender);

    if (triangle) {
      // Safety: the Triangle number is OTP-only. It must NEVER be a payment.
      return {
        kind: otpContext && extraction.code ? 'otp' : 'unknown',
        provider: 'triangle',
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode: extraction.code,
        otpLike: true,
        otpReason: extraction.code ? undefined : extraction.reason,
        otpCandidates: extraction.candidates,
      };
    }

    const provider = this.detectProvider(source);
    const amount = firstMatch(body, [
      /(?:Tk|Taka|৳)\s*([0-9,]+(?:\.\d{1,2})?)/i,
      /([0-9,]+(?:\.\d{1,2})?)\s*(?:টাকা|Tk\b|Taka\b)/i,
    ]);
    const trxId = firstMatch(body, [
      /(?:Trx(?:\s*ID)?|Transaction(?:\s*ID)?|ট্রানজেকশন(?:\s*আইডি)?)\s*[:#]?\s*([A-Za-z0-9]{6,20})/i,
    ]);
    const referenceCode = firstMatch(body, [
      /\b(?:Ref(?:erence)?|রেফারেন্স)\b\s*(?:No\.?|Number|নং)?\s*[:#-]?\s*([A-Za-z0-9]{3,16})/i,
    ]);
    const senderMobile = this.extractMobile(body);

    // A real payment message wins over the generic "any 6-digit code while an
    // OTP window is active" rule.
    if (amount && trxId) {
      const taka = Number(amount.replace(/,/g, ''));
      return {
        kind: 'payment',
        provider,
        amountPaisa: taka > 0 ? Math.round(taka * 100) : null,
        trxId,
        referenceCode,
        senderMobile,
        otpCode: null,
      };
    }

    if (otpContext && extraction.code) {
      return {
        kind: 'otp',
        provider: 'triangle',
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode: extraction.code,
        otpLike: true,
      };
    }

    if (otpContext) {
      return {
        kind: 'unknown',
        provider,
        amountPaisa: null,
        trxId: null,
        referenceCode,
        senderMobile,
        otpCode: null,
        otpLike: true,
        otpReason: extraction.reason,
        otpCandidates: extraction.candidates,
      };
    }

    // Preserve the existing payment-inbox behavior: an amount or a Trx ID is
    // enough to classify it as a payment; handlePayment reports the missing
    // field for manual review.
    if (amount || trxId) {
      const taka = amount ? Number(amount.replace(/,/g, '')) : 0;
      return {
        kind: 'payment',
        provider,
        amountPaisa: taka > 0 ? Math.round(taka * 100) : null,
        trxId,
        referenceCode,
        senderMobile,
        otpCode: null,
      };
    }

    return {
      kind: 'unknown',
      provider,
      amountPaisa: null,
      trxId: null,
      referenceCode,
      senderMobile,
      otpCode: null,
    };
  }

  private detectProvider(source: string): string | null {
    const lower = source.toLowerCase();
    if (lower.includes('bkash') || lower.includes('বিকাশ')) return 'bkash';
    if (lower.includes('nagad') || lower.includes('নগদ')) return 'nagad';
    if (lower.includes('rocket') || lower.includes('রকেট')) return 'rocket';
    return null;
  }

  private extractMobile(body: string): string | null {
    const patterns = [
      /(?:from|থেকে)\s*(?:\+?880|0)?([1-9]\d{9})/i,
      /(?:\+?880|0)?([1-9]\d{9})/,
    ];
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const digits = match[1];
        if (digits.length === 10) return `0${digits}`;
      }
    }
    return null;
  }
}
