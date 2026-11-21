import { API_URL, getAccessToken, refreshSession } from './api';

export interface ApiClient {
  id: string;
  publicId: string;
  paymentCode: string | null;
  name: string;
  mobile: string;
  altMobile?: string | null;
  address?: string | null;
  status: string;
  billingType: string;
  pppoeUsername?: string | null;
  ipAddress?: string | null;
  hasPppoePassword: boolean;
  hasNid: boolean;
  duePaisa: number;
  area?: { id: string; name: string } | null;
  billingProfile?: {
    billingType: string;
    monthlyAmountOverride: number | null;
    discount: number;
    dueDay: number;
    graceDays: number;
    autoRenew: boolean;
    autoRecharge: boolean;
  } | null;
  subscriptions: Array<{
    id: string;
    startAt: string;
    expireAt: string | null;
    status: string;
    package: { id: string; name: string; speedMbps: number | null; localPrice: number };
  }>;
}

export interface ClientList {
  data: ApiClient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiArea {
  id: string;
  name: string;
  district?: string | null;
  thana?: string | null;
  _count?: { clients: number };
}

export interface ApiPackage {
  id: string;
  name: string;
  speedMbps?: number | null;
  localPrice: number;
  upstreamPrice: number | null;
  cbp: number;
  status: string;
  _count?: { subscriptions: number };
}

export interface ApiPayment {
  id: string;
  clientId: string;
  invoiceId?: string | null;
  method: string;
  provider: string;
  accountType: string;
  receiverNumber?: string | null;
  channel: string;
  amount: number;
  trxId: string | null;
  senderNumber?: string | null;
  referenceCode?: string | null;
  paidAt?: string | null;
  status: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  client?: { id: string; name: string; publicId: string; mobile: string };
  invoice?: { id: string; number: string; total: number; dueAmount: number } | null;
}

export interface PaymentList {
  data: ApiPayment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiInvoice {
  id: string;
  number: string;
  clientId: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate?: string | null;
  createdAt: string;
  notes?: string | null;
  client?: { id: string; name: string; publicId: string; mobile?: string };
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  payments?: ApiPayment[];
}

export interface InvoiceSummary {
  totalInvoicedPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  overduePaisa: number;
  invoiceCount: number;
  byStatus: Array<{
    status: string;
    count: number;
    totalPaisa: number;
    paidPaisa: number;
    duePaisa: number;
  }>;
}

export interface InvoiceList {
  data: ApiInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CollectionReport {
  totalPaisa: number;
  count: number;
  byMethod: Array<{ method: string; count: number; totalPaisa: number }>;
}

export interface DueReport {
  totalDuePaisa: number;
  count: number;
  top: Array<{
    id: string;
    number: string;
    dueAmount: number;
    dueDate: string | null;
    client: { id: string; name: string; publicId: string; area?: { name: string } | null };
  }>;
}

export interface ProfitReport {
  collectedPaisa: number;
  vatPaisa: number;
  revenuePaisa: number;
  upstreamCostPaisa: number;
  grossMarginPaisa: number;
}

export interface MonthlyCollection {
  data: Array<{ month: string; totalPaisa: number }>;
}

export class LiveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'LiveApiError';
  }
}

export async function liveFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return liveFetch<T>(path, options, false);
    }
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message || `Request failed (${response.status})`;
    throw new LiveApiError(message, response.status);
  }

  return data as T;
}

export function getClients(params: {
  page?: number;
  limit?: number;
  status?: string;
  areaId?: string;
  search?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<ClientList>(`/clients?${query.toString()}`);
}

export function getClient(id: string) {
  return liveFetch<ApiClient>(`/clients/${id}`);
}

export function createClient(payload: Record<string, unknown>) {
  return liveFetch<ApiClient>('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateClient(id: string, payload: Record<string, unknown>) {
  return liveFetch<ApiClient>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function revealClient(id: string, field: 'pppoe' | 'nid') {
  return liveFetch<{ field: string; value: string }>(`/clients/${id}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ field }),
  });
}

export function getAreas() {
  return liveFetch<ApiArea[]>('/areas');
}

export function getPackages() {
  return liveFetch<ApiPackage[]>('/packages');
}

export function getPayments(params: {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
  search?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<PaymentList>(`/payments?${query.toString()}`);
}

export function verifyPayment(id: string) {
  return liveFetch(`/payments/${id}/verify`, { method: 'POST', body: '{}' });
}

export function rejectPayment(id: string, reason: string) {
  return liveFetch(`/payments/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function getInvoices(params: {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
  search?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<InvoiceList>(`/invoices?${query.toString()}`);
}

export function getInvoice(id: string) {
  return liveFetch<ApiInvoice>(`/invoices/${id}`);
}

export function createInvoice(payload: Record<string, unknown>) {
  return liveFetch<ApiInvoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function waiveInvoice(id: string, reason?: string) {
  return liveFetch<ApiInvoice>(`/invoices/${id}/waive`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function sendInvoice(id: string) {
  return liveFetch<{ sent: boolean; reason?: string }>(`/invoices/${id}/send`, {
    method: 'POST',
    body: '{}',
  });
}

export function getInvoiceSummary() {
  return liveFetch<InvoiceSummary>('/invoices/summary');
}

export function createPayment(payload: Record<string, unknown>) {
  return liveFetch<ApiPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getUnmatchedPayments() {
  return liveFetch<ApiPayment[]>('/payments/unmatched');
}

export function refundPayment(id: string) {
  return liveFetch<ApiPayment>(`/payments/${id}/refund`, {
    method: 'POST',
    body: '{}',
  });
}

export function matchPayment(id: string, invoiceId?: string, clientId?: string) {
  return liveFetch<ApiPayment>(`/payments/${id}/match`, {
    method: 'POST',
    body: JSON.stringify({
      ...(invoiceId ? { invoiceId } : {}),
      ...(clientId ? { clientId } : {}),
    }),
  });
}

export function getCollectionReport() {
  return liveFetch<CollectionReport>('/reports/collection');
}

export function getDueReport() {
  return liveFetch<DueReport>('/reports/due');
}

export function getMonthlyCollection() {
  return liveFetch<MonthlyCollection>('/reports/monthly-collection');
}

export function getProfitReport(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return liveFetch<ProfitReport>(`/reports/profit${suffix}`);
}

export interface PermissionOption {
  key: string;
  description: string | null;
}

export interface ManagedRole {
  id: string;
  name: string;
  level: number;
  isSystem?: boolean;
  rolePermissions?: Array<{ permissionKey: string }>;
}

export interface ManagedUser {
  id: string;
  name: string;
  mobile: string;
  loginId: string | null;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  role: {
    id: string;
    name: string;
    level: number;
    rolePermissions: Array<{ permissionKey: string }>;
  };
  permissionOverrides: Array<{
    permissionKey: string;
    effect: 'allow' | 'deny';
  }>;
  areaScopes: Array<{ area: { id: string; name: string } }>;
}

export interface UserLoginLog {
  id: string;
  userId: string | null;
  clientId: string | null;
  loginId: string;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  ip: string | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    loginId: string | null;
    role: { name: string };
  } | null;
}

export interface LogPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SmsInboundRecord {
  id: string;
  sender: string | null;
  body: string;
  kind: string;
  provider: string | null;
  amountPaisa: number;
  trxId: string | null;
  referenceCode: string | null;
  senderMobile: string | null;
  status: string;
  error: string | null;
  receivedAt: string | null;
  createdAt: string;
  payment: { id: string; status: string; amount: number } | null;
}

export function getSmsInbound(params: {
  page?: number;
  limit?: number;
  status?: string;
  kind?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<SmsInboundRecord>>(`/webhooks/sms?${query.toString()}`);
}

export function matchSmsPayment(id: string, clientId: string) {
  return liveFetch<{
    matched: boolean;
    paymentId: string;
    clientName: string;
    status: string;
    rechargeQueued: boolean;
  }>(`/webhooks/sms/${id}/match`, {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
}

export function getUsers(role?: string) {
  const query = role ? `?role=${encodeURIComponent(role)}` : '';
  return liveFetch<ManagedUser[]>(`/users${query}`);
}

export function deleteUser(id: string) {
  return liveFetch<{ success: boolean }>(`/users/${id}`, {
    method: 'DELETE',
  });
}

export function getClientLogins(params: {
  page?: number;
  limit?: number;
  clientId?: string;
  from?: string;
  to?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<UserLoginLog>>(`/logs/client-logins?${query.toString()}`);
}

export function getUserLogins(params: {
  page?: number;
  limit?: number;
  role?: string;
  userId?: string;
  from?: string;
  to?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<UserLoginLog>>(`/logs/user-logins?${query.toString()}`);
}

export interface RechargeJobRecord {
  id: string;
  clientId: string;
  invoiceId: string | null;
  paymentId: string | null;
  packageId: string | null;
  amount: number;
  durationDays: number | null;
  upstreamCostPaisa: number;
  status: string;
  attempts: number;
  lastError: string | null;
  upstreamRef: string | null;
  createdAt: string;
  client?: { id: string; name: string; publicId: string; paymentCode: string | null } | null;
  invoice?: { id: string; number: string } | null;
  payment?: {
    id: string;
    trxId: string | null;
    referenceCode: string | null;
    provider: string;
    accountType: string;
  } | null;
}

export interface LedgerEntryRecord {
  id: string;
  transactionId: string;
  clientId: string | null;
  debit: number;
  credit: number;
  refType: string | null;
  refId: string | null;
  description: string | null;
  createdAt: string;
  account: { code: string; name: string; type: string };
  client?: { id: string; name: string; publicId: string; paymentCode: string | null } | null;
}

export function getRechargeHistory(params: {
  page?: number;
  limit?: number;
  clientId?: string;
  status?: string;
  from?: string;
  to?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<RechargeJobRecord>>(
    `/reports/recharge-jobs?${query.toString()}`,
  );
}

export function getLedgerHistory(params: {
  page?: number;
  limit?: number;
  clientId?: string;
  from?: string;
  to?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<LedgerEntryRecord>>(`/reports/ledger?${query.toString()}`);
}

export function getAuditLogs(params: {
  page?: number;
  limit?: number;
  actorId?: string;
  module?: string;
  entityType?: string;
  from?: string;
  to?: string;
} = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return liveFetch<LogPage<AuditLogEntry>>(`/logs/audit?${query.toString()}`);
}

export function getRoles() {
  return liveFetch<ManagedRole[]>('/users/roles');
}

export function getPermissions() {
  return liveFetch<PermissionOption[]>('/users/permissions');
}

export function createManagedUser(payload: Record<string, unknown>) {
  return liveFetch<ManagedUser>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveUserPermissions(
  id: string,
  overrides: Array<{ permissionKey: string; effect: 'allow' | 'deny' }>,
) {
  return liveFetch<ManagedUser>(`/users/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ overrides }),
  });
}

export function setUserStatus(id: string, status: 'active' | 'disabled') {
  return liveFetch<ManagedUser>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function resetUserPassword(id: string, password: string) {
  return liveFetch<{ success: boolean }>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export interface Branding {
  name: string;
  logoDataUrl: string | null;
}

export function getBranding() {
  return liveFetch<Branding>('/settings/branding');
}

export function updateBranding(payload: Record<string, unknown>) {
  return liveFetch<Branding>('/settings/branding', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export interface TaxSettings {
  id?: string;
  enabled: boolean;
  rateBps: number;
  inclusive: boolean;
  label: string;
}

export interface PaymentSettings {
  id: string;
  type: string;
  merchantNumber: string | null;
  label: string | null;
  instructions: string | null;
  merchantActive: boolean;
  personalNumber: string | null;
  personalLabel: string | null;
  personalInstructions: string | null;
  personalActive: boolean;
  isActive: boolean;
  updatedAt?: string;
}

export interface SmsSettings {
  id: string;
  provider: string;
  apiEndpoint: string | null;
  senderId: string | null;
  isActive: boolean;
  hasApiKey: boolean;
  updatedAt?: string;
}

export interface AutoRechargeSettings {
  enabled: boolean;
  approvalThresholdPaisa: number;
}

export interface PortalSummary {
  client: ApiClient;
  totalDuePaisa: number;
  recentInvoices: ApiInvoice[];
  recentPayments: ApiPayment[];
}

export interface PortalPaymentAccount {
  provider: string;
  accountType: 'merchant' | 'personal';
  number: string;
  label?: string | null;
  instructions?: string | null;
}

export interface PortalPaymentMethods {
  available: boolean;
  accounts?: PortalPaymentAccount[];
  method?: string;
  merchantNumber?: string;
  label?: string;
  instructions?: string;
}

export function getTaxSettings() {
  return liveFetch<TaxSettings>('/settings/tax');
}

export function updateTaxSettings(payload: Record<string, unknown>) {
  return liveFetch<TaxSettings>('/settings/tax', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getPaymentSettings() {
  return liveFetch<PaymentSettings[]>('/settings/payment');
}

export function updatePaymentSettings(payload: Record<string, unknown>) {
  return liveFetch<PaymentSettings>('/settings/payment', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getSmsSettings() {
  return liveFetch<SmsSettings[]>('/settings/sms');
}

export function updateSmsSettings(payload: Record<string, unknown>) {
  return liveFetch<SmsSettings>('/settings/sms', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getAutoRechargeSettings() {
  return liveFetch<AutoRechargeSettings>('/settings/auto-recharge');
}

export function updateAutoRechargeSettings(payload: Record<string, unknown>) {
  return liveFetch<AutoRechargeSettings>('/settings/auto-recharge', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createPackage(payload: Record<string, unknown>) {
  return liveFetch<ApiPackage>('/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePackage(id: string, payload: Record<string, unknown>) {
  return liveFetch<ApiPackage>(`/packages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function createArea(payload: Record<string, unknown>) {
  return liveFetch<ApiArea>('/areas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPortalSummary() {
  return liveFetch<PortalSummary>('/me/summary');
}

export function getPortalInvoices() {
  return liveFetch<ApiInvoice[]>('/me/invoices');
}

export function getPortalPayments() {
  return liveFetch<ApiPayment[]>('/me/payments');
}

export function getPortalPaymentMethods() {
  return liveFetch<PortalPaymentMethods>('/me/payment-methods');
}

export function submitPortalPayment(payload: Record<string, unknown>) {
  return liveFetch<ApiPayment>('/me/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function formatPaisa(paisa: number, symbol = true): string {
  const taka = (paisa || 0) / 100;
  const formatted = new Intl.NumberFormat('en-BD', {
    maximumFractionDigits: 2,
  }).format(taka);
  return symbol ? `৳ ${formatted}` : formatted;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusTone(status: string): string {
  const map: Record<string, string> = {
    active: 'green',
    verified: 'green',
    paid: 'green',
    pending: 'amber',
    due: 'amber',
    partial: 'amber',
    expired: 'red',
    overdue: 'red',
    rejected: 'red',
    refunded: 'red',
    inactive: 'amber',
    free: 'blue',
    draft: 'gray',
    waived: 'gray',
  };
  return map[status] || 'gray';
}

export function displayStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
