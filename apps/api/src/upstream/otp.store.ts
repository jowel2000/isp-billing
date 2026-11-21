import { Injectable } from '@nestjs/common';

interface StoredOtp {
  code: string;
  receivedAt: Date;
}

@Injectable()
export class OtpStore {
  private readonly values = new Map<string, StoredOtp>();

  set(key: string, code: string) {
    this.values.set(key, { code, receivedAt: new Date() });
  }

  get(key: string): StoredOtp | null {
    return this.values.get(key) ?? null;
  }

  clear(key: string) {
    this.values.delete(key);
  }

  status(key: string) {
    const value = this.values.get(key);
    return value
      ? { hasOtp: true, receivedAt: value.receivedAt }
      : { hasOtp: false, receivedAt: null };
  }
}
