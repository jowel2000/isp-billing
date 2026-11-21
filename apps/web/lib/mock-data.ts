export type ClientStatus = 'active' | 'expired' | 'inactive' | 'free';
export type PaymentStatus = 'pending' | 'verified' | 'rejected';
export type InvoiceStatus = 'paid' | 'due' | 'overdue' | 'draft';

export interface DemoClient {
  id: string;
  name: string;
  area: string;
  package: string;
  status: ClientStatus;
  due: number;
  expiry: string;
  phone: string;
}

export interface DemoPayment {
  id: string;
  trxId: string;
  client: string;
  clientId: string;
  method: 'bKash' | 'Cash';
  amount: number;
  sender: string;
  submitted: string;
  status: PaymentStatus;
}

export interface DemoInvoice {
  id: string;
  number: string;
  client: string;
  period: string;
  amount: number;
  vat: number;
  total: number;
  dueDate: string;
  status: InvoiceStatus;
}

export const demoUser = {
  name: 'Super Admin',
  role: 'Super Admin',
  initials: 'SA',
  tenant: 'TRG · Muradnagar, Cumilla',
};

export const dashboardStats = [
  {
    label: 'Total Clients',
    value: '128',
    hint: '+8 this month',
    trend: 'up',
    delta: '+8',
    icon: 'users',
    tone: 'orange',
  },
  {
    label: 'Active Clients',
    value: '112',
    hint: '87.5% of total',
    trend: 'up',
    delta: '+5',
    icon: 'wifi',
    tone: 'green',
  },
  {
    label: 'Due Amount',
    value: '৳84,500',
    hint: '18 clients pending',
    trend: 'warn',
    delta: 'Attention',
    icon: 'wallet',
    tone: 'red',
  },
  {
    label: 'Collected (Nov)',
    value: '৳312,400',
    hint: '+12.4% vs October',
    trend: 'up',
    delta: '+12.4%',
    icon: 'trend-up',
    tone: 'blue',
  },
];

export const revenueSeries = [
  { month: 'এপ্রিল', value: 186000 },
  { month: 'মে', value: 205000 },
  { month: 'জুন', value: 198000 },
  { month: 'জুলাই', value: 232000 },
  { month: 'আগস্ট', value: 251000 },
  { month: 'সেপ্টেম্বর', value: 244000 },
  { month: 'অক্টোবর', value: 278000 },
  { month: 'নভেম্বর', value: 312400 },
];

export const clientStatus = [
  { label: 'Active', value: 112, color: '#10b981' },
  { label: 'Expired', value: 9, color: '#ef4444' },
  { label: 'Inactive', value: 4, color: '#f59e0b' },
  { label: 'Free', value: 3, color: '#3b82f6' },
];

export const recentPayments: DemoPayment[] = [
  {
    id: 'p1',
    trxId: 'BKH8F2K91A',
    client: 'Rahim Uddin',
    clientId: 'TRG-000101-4',
    method: 'bKash',
    amount: 250,
    sender: '01712•••••9',
    submitted: 'আজ, 10:42 AM',
    status: 'verified',
  },
  {
    id: 'p2',
    trxId: 'BKH3D7M22B',
    client: 'Nasima Akter',
    clientId: 'TRG-000102-1',
    method: 'bKash',
    amount: 300,
    sender: '01865•••••7',
    submitted: 'আজ, 10:18 AM',
    status: 'pending',
  },
  {
    id: 'p3',
    trxId: 'BKH9Q1P45C',
    client: 'Jahangir Alam',
    clientId: 'TRG-000103-8',
    method: 'bKash',
    amount: 250,
    sender: '01996•••••3',
    submitted: 'আজ, 09:55 AM',
    status: 'pending',
  },
  {
    id: 'p4',
    trxId: 'CASH-1024',
    client: 'Shahida Begum',
    clientId: 'TRG-000104-5',
    method: 'Cash',
    amount: 500,
    sender: 'Staff · Mizan',
    submitted: 'আজ, 09:20 AM',
    status: 'verified',
  },
  {
    id: 'p5',
    trxId: 'BKH5L8N63D',
    client: 'Tanvir Ahmed',
    clientId: 'TRG-000105-2',
    method: 'bKash',
    amount: 400,
    sender: '01629•••••1',
    submitted: 'গতকাল, 08:40 PM',
    status: 'rejected',
  },
  {
    id: 'p6',
    trxId: 'BKH1R4T77E',
    client: 'Sumaiya Islam',
    clientId: 'TRG-000106-9',
    method: 'bKash',
    amount: 250,
    sender: '01328•••••6',
    submitted: 'গতকাল, 07:12 PM',
    status: 'pending',
  },
];

export const clients: DemoClient[] = [
  {
    id: 'TRG-000101-4',
    name: 'Rahim Uddin',
    area: 'Muradnagar',
    package: '25 Mbps',
    status: 'active',
    due: 0,
    expiry: '30 Nov 2026',
    phone: '01712•••••9',
  },
  {
    id: 'TRG-000102-1',
    name: 'Nasima Akter',
    area: 'Bhabanipur',
    package: '30 Mbps',
    status: 'active',
    due: 300,
    expiry: '27 Nov 2026',
    phone: '01865•••••7',
  },
  {
    id: 'TRG-000103-8',
    name: 'Jahangir Alam',
    area: 'Mochagora',
    package: '25 Mbps',
    status: 'expired',
    due: 250,
    expiry: '17 Nov 2026',
    phone: '01996•••••3',
  },
  {
    id: 'TRG-000104-5',
    name: 'Shahida Begum',
    area: 'Jatrapur',
    package: '40 Mbps',
    status: 'active',
    due: 0,
    expiry: '04 Dec 2026',
    phone: '01881•••••2',
  },
  {
    id: 'TRG-000105-2',
    name: 'Tanvir Ahmed',
    area: 'Muradnagar',
    package: '50 Mbps',
    status: 'active',
    due: 500,
    expiry: '22 Nov 2026',
    phone: '01629•••••1',
  },
  {
    id: 'TRG-000106-9',
    name: 'Sumaiya Islam',
    area: 'Bhabanipur',
    package: '25 Mbps',
    status: 'inactive',
    due: 250,
    expiry: '12 Nov 2026',
    phone: '01328•••••6',
  },
  {
    id: 'TRG-000107-6',
    name: 'Mizanur Rahman',
    area: 'Cumilla Sadar',
    package: '30 Mbps',
    status: 'active',
    due: 0,
    expiry: '08 Dec 2026',
    phone: '01740•••••8',
  },
  {
    id: 'TRG-000108-3',
    name: 'Shahin Alam',
    area: 'Mochagora',
    package: '12 Mbps',
    status: 'free',
    due: 0,
    expiry: '31 Dec 2026',
    phone: '01920•••••4',
  },
  {
    id: 'TRG-000109-0',
    name: 'Abdul Karim',
    area: 'Jatrapur',
    package: '25 Mbps',
    status: 'active',
    due: 0,
    expiry: '29 Nov 2026',
    phone: '01819•••••7',
  },
  {
    id: 'TRG-000110-5',
    name: 'Rafiqul Islam',
    area: 'Bhabanipur',
    package: '40 Mbps',
    status: 'expired',
    due: 400,
    expiry: '15 Nov 2026',
    phone: '01766•••••2',
  },
];

export const pendingPayments: DemoPayment[] = recentPayments.filter(
  (payment) => payment.status === 'pending',
);

export const invoices: DemoInvoice[] = [
  {
    id: 'inv1',
    number: 'INV-TRG-2026-11-0042',
    client: 'Rahim Uddin',
    period: 'নভেম্বর ২০২৬',
    amount: 250,
    vat: 12.5,
    total: 262.5,
    dueDate: '30 Nov 2026',
    status: 'due',
  },
  {
    id: 'inv2',
    number: 'INV-TRG-2026-11-0041',
    client: 'Nasima Akter',
    period: 'নভেম্বর ২০২৬',
    amount: 300,
    vat: 15,
    total: 315,
    dueDate: '27 Nov 2026',
    status: 'due',
  },
  {
    id: 'inv3',
    number: 'INV-TRG-2026-11-0040',
    client: 'Shahida Begum',
    period: 'নভেম্বর ২০২৬',
    amount: 500,
    vat: 25,
    total: 525,
    dueDate: '04 Dec 2026',
    status: 'paid',
  },
  {
    id: 'inv4',
    number: 'INV-TRG-2026-11-0039',
    client: 'Jahangir Alam',
    period: 'নভেম্বর ২০২৬',
    amount: 250,
    vat: 12.5,
    total: 262.5,
    dueDate: '17 Nov 2026',
    status: 'overdue',
  },
  {
    id: 'inv5',
    number: 'INV-TRG-2026-11-0038',
    client: 'Tanvir Ahmed',
    period: 'নভেম্বর ২০২৬',
    amount: 500,
    vat: 25,
    total: 525,
    dueDate: '22 Nov 2026',
    status: 'due',
  },
  {
    id: 'inv6',
    number: 'INV-TRG-2026-11-0037',
    client: 'Mizanur Rahman',
    period: 'নভেম্বর ২০২৬',
    amount: 300,
    vat: 15,
    total: 315,
    dueDate: '08 Dec 2026',
    status: 'paid',
  },
  {
    id: 'inv7',
    number: 'INV-TRG-2026-11-0036',
    client: 'Abdul Karim',
    period: 'নভেম্বর ২০২৬',
    amount: 250,
    vat: 12.5,
    total: 262.5,
    dueDate: '29 Nov 2026',
    status: 'draft',
  },
];

export const packages = [
  { name: '12 Mbps', speed: 12, price: 300, cbp: 0, clients: 4, status: 'inactive' },
  { name: '25 Mbps', speed: 25, price: 250, cbp: 0, clients: 72, status: 'active' },
  { name: '30 Mbps', speed: 30, price: 300, cbp: 0, clients: 31, status: 'active' },
  { name: '40 Mbps', speed: 40, price: 400, cbp: 0, clients: 14, status: 'active' },
  { name: '50 Mbps', speed: 50, price: 555, cbp: 0, clients: 7, status: 'active' },
  { name: '70 Mbps', speed: 70, price: 700, cbp: 0, clients: 0, status: 'active' },
];

export const areaCollections = [
  { area: 'Muradnagar', clients: 64, collected: 16400, due: 2100 },
  { area: 'Bhabanipur', clients: 32, collected: 8900, due: 1450 },
  { area: 'Mochagora', clients: 21, collected: 5200, due: 900 },
  { area: 'Jatrapur', clients: 11, collected: 3100, due: 450 },
];

export const activity = [
  {
    title: 'bKash পেমেন্ট verified',
    detail: 'Rahim Uddin · ৳250 · BKH8F2K91A',
    time: '১০ মিনিট আগে',
    tone: 'green',
  },
  {
    title: 'নতুন ক্লায়েন্ট যোগ হয়েছে',
    detail: 'Shahida Begum · Jatrapur · 40 Mbps',
    time: '৩৫ মিনিট আগে',
    tone: 'blue',
  },
  {
    title: 'প্যাকেজ পরিবর্তন',
    detail: 'Tanvir Ahmed · 30 Mbps → 50 Mbps',
    time: '১ ঘণ্টা আগে',
    tone: 'orange',
  },
  {
    title: 'Due reminder পাঠানো হয়েছে',
    detail: '১৮ জন ক্লায়েন্ট · SMS ব্যালেন্স ২৪০',
    time: '২ ঘণ্টা আগে',
    tone: 'muted',
  },
];

export function formatMoney(value: number, withSymbol = true): string {
  const formatted = new Intl.NumberFormat('en-BD', {
    maximumFractionDigits: 2,
  }).format(value);
  return withSymbol ? `৳ ${formatted}` : formatted;
}

export const statusLabel: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  inactive: 'Inactive',
  free: 'Free',
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  draft: 'Draft',
};
