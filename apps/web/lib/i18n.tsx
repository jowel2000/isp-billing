'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Language = 'bn' | 'en';

const STORAGE_KEY = 'isp_language';

const dictionary: Record<string, { bn: string; en: string }> = {
  'nav.dashboard': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'nav.clients': { bn: 'ক্লায়েন্ট', en: 'Clients' },
  'nav.payments': { bn: 'পেমেন্ট', en: 'Payments' },
  'nav.invoices': { bn: 'ইনভয়েস', en: 'Invoices' },
  'nav.rechargeHistory': { bn: 'রিচার্জ হিস্ট্রি', en: 'Recharge History' },
  'nav.paymentInbox': { bn: 'পেমেন্ট ইনবক্স', en: 'Payment Inbox' },
  'nav.wrongRecharge': { bn: 'ভুল রিচার্জ', en: 'Wrong Recharge' },
  'nav.packages': { bn: 'প্যাকেজ', en: 'Packages' },
  'nav.reports': { bn: 'রিপোর্ট', en: 'Reports' },
  'nav.admin': { bn: 'অ্যাডমিন', en: 'Admin' },
  'nav.staff': { bn: 'স্টাফ', en: 'Staff' },
  'nav.mobileBanking': { bn: 'মোবাইল ব্যাংকিং', en: 'Mobile Banking' },
  'nav.activityLogs': { bn: 'অ্যাক্টিভিটি ও লগ', en: 'Activity & Logs' },
  'nav.branding': { bn: 'ব্র্যান্ডিং', en: 'Branding' },
  'nav.settings': { bn: 'সেটিংস', en: 'Settings' },
  'page.dashboard': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'page.clients': { bn: 'ক্লায়েন্ট', en: 'Clients' },
  'page.payments': { bn: 'পেমেন্ট', en: 'Payments' },
  'page.invoices': { bn: 'ইনভয়েস', en: 'Invoices' },
  'page.rechargeHistory': { bn: 'রিচার্জ হিস্ট্রি', en: 'Recharge History' },
  'page.paymentInbox': { bn: 'পেমেন্ট ইনবক্স', en: 'Payment Inbox' },
  'page.wrongRecharge': { bn: 'ভুল রিচার্জ', en: 'Wrong Recharge' },
  'page.packages': { bn: 'প্যাকেজ ও এরিয়া', en: 'Packages & Areas' },
  'page.reports': { bn: 'রিপোর্ট', en: 'Reports' },
  'page.users': { bn: 'ইউজার ও পারমিশন', en: 'Users & Permissions' },
  'page.mobileBanking': { bn: 'মোবাইল ব্যাংকিং', en: 'Mobile Banking' },
  'page.branding': { bn: 'ব্র্যান্ডিং', en: 'Branding' },
  'page.settings': { bn: 'সেটিংস', en: 'Settings' },
  'page.activityLogs': { bn: 'Activity & Logs', en: 'Activity & Logs' },
  'page.portal': { bn: 'Client Portal', en: 'Client Portal' },
  'common.refresh': { bn: 'রিফ্রেশ', en: 'Refresh' },
  'common.addClient': { bn: 'নতুন ক্লায়েন্ট', en: 'Add Client' },
  'common.save': { bn: 'সেভ করুন', en: 'Save' },
  'common.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'common.view': { bn: 'দেখুন', en: 'View' },
  'common.edit': { bn: 'এডিট', en: 'Edit' },
  'common.delete': { bn: 'ডিলিট', en: 'Delete' },
  'common.search': { bn: 'খুঁজুন', en: 'Search' },
  'app.liveData': { bn: 'লাইভ ডেটা', en: 'LIVE DATA' },
  'app.ispBillingPanel': { bn: 'আইএসপি বিলিং প্যানেল', en: 'ISP Billing Panel' },
  'app.logout': { bn: 'লগআউট', en: 'Logout' },
  'auth.signIn': { bn: 'লগইন', en: 'Login' },
  'auth.signInHint': {
    bn: 'আপনার Login ID ও পাসওয়ার্ড দিন।',
    en: 'Enter your Login ID and password.',
  },
  'auth.loginId': { bn: 'লগইন আইডি', en: 'Login ID' },
  'auth.password': { bn: 'পাসওয়ার্ড', en: 'Password' },
  'auth.mobile': { bn: 'মোবাইল', en: 'Mobile' },
  'auth.remember': { bn: 'আমাকে মনে রাখুন', en: 'Remember me' },
  'auth.forgot': { bn: 'পাসওয়ার্ড ভুলে গেছেন?', en: 'Forgot password?' },
  'auth.forgotTitle': { bn: 'পাসওয়ার্ড রিসেট', en: 'Reset password' },
  'auth.forgotHint': {
    bn: 'অ্যাকাউন্টের সাথে যুক্ত মোবাইল নম্বর বা Login ID দিন।',
    en: 'Enter the mobile number or Login ID linked to the account.',
  },
  'auth.sendOtp': { bn: 'OTP পাঠান', en: 'Send OTP' },
  'auth.verifyOtp': { bn: 'যাচাই করুন', en: 'Verify' },
  'auth.otpLabel': { bn: '৬ ডিজিট OTP', en: '6-digit OTP' },
  'auth.demoOtp': {
    bn: 'ডেমো OTP (SMS গেটওয়ে এখনো যুক্ত হয়নি):',
    en: 'Demo OTP (no SMS gateway yet):',
  },
  'auth.otpSentNote': {
    bn: 'OTP আপনার নিবন্ধিত মোবাইল নম্বরে পাঠানো হয়েছে।',
    en: 'OTP has been sent to your registered mobile number.',
  },
  'auth.newPassword': { bn: 'নতুন পাসওয়ার্ড', en: 'New password' },
  'auth.confirmPassword': {
    bn: 'পাসওয়ার্ড আবার লিখুন',
    en: 'Confirm password',
  },
  'auth.resetSave': { bn: 'সেভ করুন', en: 'Save' },
  'auth.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'auth.back': { bn: 'পিছনে', en: 'Back' },
  'auth.resetSuccess': {
    bn: 'পাসওয়ার্ড সফলভাবে বদলানো হয়েছে — এখন লগইন করুন।',
    en: 'Password changed successfully — please sign in.',
  },
  'auth.passMismatch': {
    bn: 'নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।',
    en: 'New password and confirm password do not match.',
  },
  'auth.passShort': {
    bn: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
    en: 'Password must be at least 6 characters long.',
  },
  'auth.submit': { bn: 'লগইন', en: 'Login' },
  'auth.signingIn': { bn: 'লগইন হচ্ছে…', en: 'Signing in…' },
  'auth.demo': { bn: 'ডেমো ডিজাইন দেখুন', en: 'View demo design' },
  'auth.demoHint': {
    bn: 'লগইন ছাড়াই পুরো প্যানেল ঘুরে দেখুন',
    en: 'Preview the full panel without logging in',
  },
  'dash.liveDb': { bn: 'লাইভ ডেটাবেস থেকে', en: 'from the live database' },
  'dash.refresh': { bn: 'রিফ্রেশ', en: 'Refresh' },
  'dash.addClient': { bn: 'নতুন ক্লায়েন্ট', en: 'Add Client' },
  'dash.monthlyCollection': { bn: 'মাসিক কালেকশন', en: 'Monthly Collection' },
  'dash.last8Months': { bn: 'শেষ ৮ মাস · যাচাইকৃত পেমেন্ট', en: 'Last 8 months · verified payments' },
  'dash.totalCollected': { bn: 'মোট সংগৃহীত', en: 'Total Collected' },
  'dash.clientStatus': { bn: 'ক্লায়েন্ট স্ট্যাটাস', en: 'Client Status' },
  'dash.clientsCount': { bn: 'মোট {n} জন ক্লায়েন্ট', en: '{n} clients in total' },
  'dash.viewAll': { bn: 'সব দেখুন', en: 'View all' },
  'dash.recentPayments': { bn: 'সাম্প্রতিক পেমেন্ট', en: 'Recent Payments' },
  'dash.latestTx': { bn: 'সর্বশেষ bKash ও ক্যাশ ট্রানজেকশন', en: 'Latest bKash and cash transactions' },
  'dash.pendingVerification': { bn: 'ভেরিফিকেশন অপেক্ষায়', en: 'Pending Verification' },
  'dash.paymentsCount': { bn: '{n}টি পেমেন্ট', en: '{n} payments' },
  'dash.allVerified': { bn: 'সব পেমেন্ট যাচাইকৃত ✅', en: 'All payments verified ✅' },
  'dash.verifyFirst': { bn: 'প্রথমটি Verify করুন', en: 'Verify first' },
  'dash.verifying': { bn: 'Verifying…', en: 'Verifying…' },
  'dash.noPermVerify': { bn: 'payments.verify permission নেই', en: 'payments.verify permission missing' },
  'dash.verifyNote': {
    bn: 'Verify করলে invoice paid হবে, ledger entry তৈরি হবে এবং auto-recharge চালু থাকলে recharge job queue হবে।',
    en: 'Verifying marks the invoice paid, creates a ledger entry and queues a recharge job when auto-recharge is on.',
  },
  'dash.topDue': { bn: 'Top Due', en: 'Top Due' },
  'dash.topDueSub': { bn: 'সবচেয়ে বেশি বাকি', en: 'Highest dues' },
  'dash.noDue': { bn: 'কোনো due নেই ✅', en: 'No dues ✅' },
  'dash.dueOn': { bn: 'Due {date}', en: 'Due {date}' },
  'dash.packageMix': { bn: 'প্যাকেজ মিক্স', en: 'Package Mix' },
  'dash.byActiveClients': { bn: 'সক্রিয় ক্লায়েন্ট অনুযায়ী', en: 'by active clients' },
  'dash.noPackages': { bn: 'কোনো প্যাকেজ assigned নেই।', en: 'No packages assigned.' },
  'dash.subs': { bn: 'জন', en: 'subs' },
  'dash.profitTitle': { bn: 'Profit & Margin', en: 'Profit & Margin' },
  'dash.vatExcluded': { bn: 'VAT বাদ দিয়ে', en: 'Excluding VAT' },
  'dash.quickActions': { bn: 'দ্রুত কাজ', en: 'Quick Actions' },
  'dash.nextSteps': { bn: 'পরবর্তী ধাপ', en: 'Next steps' },
  'dash.revenue': { bn: 'Revenue', en: 'Revenue' },
  'dash.upstreamCost': { bn: 'Upstream cost', en: 'Upstream cost' },
  'dash.margin': { bn: 'Margin', en: 'Margin' },
  'dash.vatNote': { bn: 'VAT সংগৃহীত', en: 'VAT collected' },
  'dash.vatNoteTail': { bn: 'আলাদা report-এ দেখানো হবে।', en: 'will be shown in a separate report.' },
  'dash.clientList': { bn: 'ক্লায়েন্ট লিস্ট', en: 'Client List' },
  'dash.noClients': { bn: 'এখনো কোনো ক্লায়েন্ট যোগ হয়নি।', en: 'No clients added yet.' },
  'dash.noVerified': { bn: 'এখনো কোনো যাচাইকৃত পেমেন্ট নেই।', en: 'No verified payments yet.' },
  'dash.noPayments': { bn: 'এখনো কোনো পেমেন্ট নেই।', en: 'No payments yet.' },
  'dash.getStarted': { bn: 'শুরু করুন:', en: 'Get started:' },
  'dash.firstClient': { bn: 'প্রথম ক্লায়েন্ট যোগ করুন', en: 'Add your first client' },
  'dash.loading': { bn: 'লাইভ ডেটা লোড হচ্ছে…', en: 'Loading live data…' },
  'dash.tryAgain': { bn: 'আবার চেষ্টা করুন', en: 'Try again' },
  'dash.method': { bn: 'মেথড', en: 'Method' },
  'dash.amount': { bn: 'পরিমাণ', en: 'Amount' },
  'dash.status': { bn: 'স্ট্যাটাস', en: 'Status' },
};

interface I18nState {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('bn');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'bn' || saved === 'en') setLanguageState(saved);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) =>
      dictionary[key]?.[language] ?? fallback ?? key,
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}
