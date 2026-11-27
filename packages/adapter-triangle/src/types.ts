export interface TriangleClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  requestsPerMinute?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export interface LoginResult {
  otpRequired: boolean;
  cookies: Record<string, string>;
  data: unknown;
}

export interface TriangleSession {
  cookies: Record<string, string>;
  createdAt: string;
}

export class TriangleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'TriangleApiError';
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Upstream session expired');
    this.name = 'SessionExpiredError';
  }
}

/** HTTP 511 / code E01 — business error (insufficient balance, invalid OTP). Do not retry blindly. */
export class UpstreamBusinessError extends Error {
  constructor(
    message: string,
    public readonly code = 'E01',
  ) {
    super(message);
    this.name = 'UpstreamBusinessError';
  }
}

export class PanelLockedError extends Error {
  constructor(message = 'Upstream panel is rate-limited or locked') {
    super(message);
    this.name = 'PanelLockedError';
  }
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented yet. Capture the endpoint first.`);
    this.name = 'NotImplementedError';
  }
}
