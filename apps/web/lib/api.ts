export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export interface AuthUser {
  id: string;
  tenantId: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  roleLevel: number;
  permissions: string[];
  areaIds: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

const ACCESS_KEY = 'isp_access_token';
const REFRESH_KEY = 'isp_refresh_token';

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) || `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}

export async function login(loginId: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  });
}

export interface ForgotRequestResponse {
  sent: boolean;
  devOtp: string;
  expiresIn: number;
  note?: string;
}

export function forgotPasswordRequest(identifier: string) {
  return request<ForgotRequestResponse>('/auth/forgot-password/request', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export function forgotPasswordVerify(identifier: string, otp: string) {
  return request<{ verified: boolean; resetToken: string }>(
    '/auth/forgot-password/verify',
    {
      method: 'POST',
      body: JSON.stringify({ identifier, otp }),
    },
  );
}

export function forgotPasswordReset(
  resetToken: string,
  newPassword: string,
  loginId?: string,
) {
  return request<{ success: boolean }>('/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify({ resetToken, newPassword, loginId }),
  });
}

export async function fetchMe(token: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/me', { method: 'GET' }, token);
}

export async function refreshSession(): Promise<LoginResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const result = await request<LoginResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    storeTokens(result.accessToken, result.refreshToken);
    return result;
  } catch {
    clearTokens();
    return null;
  }
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore network errors on logout.
    }
  }
  clearTokens();
}
