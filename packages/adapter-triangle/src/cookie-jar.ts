export class CookieJar {
  private cookies: Record<string, string> = {};

  ingest(setCookieHeaders: string[]): void {
    for (const header of setCookieHeaders) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (name) this.cookies[name] = value;
    }
  }

  toHeader(): string {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  toJSON(): Record<string, string> {
    return { ...this.cookies };
  }

  load(cookies: Record<string, string>): void {
    this.cookies = { ...cookies };
  }

  clear(): void {
    this.cookies = {};
  }

  get size(): number {
    return Object.keys(this.cookies).length;
  }
}
