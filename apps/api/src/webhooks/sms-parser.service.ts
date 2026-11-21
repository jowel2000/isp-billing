import { Injectable } from '@nestjs/common';

export interface ParsedSms {
  kind: 'payment' | 'otp' | 'unknown';
  provider: string | null;
  amountPaisa: number | null;
  trxId: string | null;
  referenceCode: string | null;
  senderMobile: string | null;
  otpCode: string | null;
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

@Injectable()
export class SmsParserService {
  parse(rawBody: string, rawSender: string | null | undefined): ParsedSms {
    const body = normalize(rawBody ?? '');
    const sender = normalize(rawSender ?? '');
    const source = `${sender} ${body}`;

    const otpCode = firstMatch(body, [/\b(\d{6})\b/]);
    const looksLikeOtp = /(otp|verification code|কোড|ওটিপি|triangle)/i.test(source);
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
