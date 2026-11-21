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
  'auth.signIn': { bn: 'লগইন করুন', en: 'Sign in' },
  'auth.signInHint': {
    bn: 'আপনার Login ID ও পাসওয়ার্ড দিন।',
    en: 'Enter your Login ID and password.',
  },
  'auth.loginId': { bn: 'Login ID', en: 'Login ID' },
  'auth.password': { bn: 'পাসওয়ার্ড', en: 'Password' },
  'auth.remember': { bn: 'আমাকে মনে রাখুন', en: 'Remember me' },
  'auth.submit': { bn: 'লগইন', en: 'Sign in' },
  'auth.signingIn': { bn: 'লগইন হচ্ছে…', en: 'Signing in…' },
  'auth.demo': { bn: 'ডেমো ডিজাইন দেখুন', en: 'View demo design' },
  'auth.demoHint': {
    bn: 'লগইন ছাড়াই পুরো প্যানেল ঘুরে দেখুন',
    en: 'Preview the full panel without logging in',
  },
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
