import { Injectable } from '@nestjs/common';

export interface ParsedSms {
  kind: 'payment' | 'otp' | 'unknown';
  provider: string | null;
  amountPaisa: number | null;
  trxId: string | null;
  referenceCode: string | null;
  senderMobile: string | null;
  otpCode: string | null;
  blocked?: string;
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

function normalize(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

function firstMatch(source: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
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
  parse(rawBody: string, rawSender: string | null | undefined): ParsedSms {
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

    const otpCode = firstMatch(body, [/\b(\d{6})\b/]);
    const looksLikeOtp =
      isTriangleSender(sender) ||
      /(otp|verification code|কোড|ওটিপি|triangle)/i.test(source);
    if (looksLikeOtp && otpCode) {
      return {
        kind: 'otp',
        provider: 'triangle',
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode,
      };
    }

    // Safety: the Triangle number is OTP-only. Even if a "payment received"
    // style message ever arrives from it, it must NEVER be treated as a payment.
    if (isTriangleSender(sender)) {
      return {
        kind: 'unknown',
        provider: 'triangle',
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode: null,
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

    if (!amount && !trxId) {
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
