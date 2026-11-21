'use client';

import { useEffect } from 'react';
import { useI18n } from './i18n';

/**
 * Lightweight UI text bridge.
 *
 * Page bodies were written with a mix of English and Bangla labels. Instead of
 * touching every JSX file, this bridge translates known static labels in the
 * DOM when the user selects বাংলা, and restores the original text for English.
 * It never touches inputs, scripts, textareas or contenteditable regions.
 */

const PHRASES: Record<string, string> = {
  Dashboard: 'ড্যাশবোর্ড',
  'Total Clients': 'মোট ক্লায়েন্ট',
  'Active Clients': 'সক্রিয় ক্লায়েন্ট',
  'Due Amount': 'বকেয়া পরিমাণ',
  Collected: 'সংগৃহীত',
  'Total Due': 'মোট বকেয়া',
  'Outstanding Due': 'বাকি বকেয়া',
  'Total Invoiced': 'মোট ইনভয়েস',
  'Total Packages': 'মোট প্যাকেজ',
  'Total Users': 'মোট ইউজার',
  'Total Entries': 'মোট এন্ট্রি',
  'Total SMS': 'মোট SMS',
  'Page Amount': 'পেজের পরিমাণ',
  'Page Upstream Cost': 'পেজের আপস্ট্রিম খরচ',
  'This Page Verified': 'এই পেজে যাচাইকৃত',
  'Matched Client': 'মিলে যাওয়া ক্লায়েন্ট',
  'Pending Amount': 'বাকি পরিমাণ',
  Pending: 'অপেক্ষমাণ',
  Verified: 'যাচাইকৃত',
  Unmatched: 'মেলেনি',
  Ignored: 'উপেক্ষিত',
  Errors: 'ত্রুটি',
  Queued: 'কিউতে',
  Activated: 'চালু',
  Failed: 'ব্যর্থ',
  Rejected: 'বাতিল',
  Draft: 'খসড়া',
  Paid: 'পরিশোধিত',
  Partial: 'আংশিক',
  Unpaid: 'অপরিশোধিত',
  Active: 'সক্রিয়',
  Inactive: 'নিষ্ক্রিয়',
  Expired: 'মেয়াদোত্তীর্ণ',
  Free: 'ফ্রি',
  Online: 'অনলাইন',
  Offline: 'অফলাইন',
  Healthy: 'সুস্থ',
  Live: 'লাইভ',
  Manual: 'ম্যানুয়াল',
  Auto: 'অটো',
  All: 'সব',
  Review: 'রিভিউ',
  'Pending Verification': 'যাচাই বাকি',
  'Action needed': 'ব্যবস্থা নিন',
  Actions: 'অ্যাকশন',
  Action: 'অ্যাকশন',
  Add: 'যোগ করুন',
  'Add Client': 'নতুন ক্লায়েন্ট',
  'Add User': 'নতুন ইউজার',
  'Add Package': 'নতুন প্যাকেজ',
  'Add Area': 'নতুন এলাকা',
  Save: 'সেভ',
  'Save changes': 'পরিবর্তন সেভ করুন',
  Cancel: 'বাতিল',
  Close: 'বন্ধ',
  Delete: 'ডিলিট',
  Edit: 'এডিট',
  View: 'দেখুন',
  Preview: 'প্রিভিউ',
  Search: 'খুঁজুন',
  'Search…': 'খুঁজুন…',
  Refresh: 'রিফ্রেশ',
  Filter: 'ফিল্টার',
  Reset: 'রিসেট',
  Export: 'এক্সপোর্ট',
  Download: 'ডাউনলোড',
  Print: 'প্রিন্ট',
  Copy: 'কপি',
  Previous: 'আগের',
  Next: 'পরবর্তী',
  Submit: 'জমা দিন',
  Verify: 'যাচাই করুন',
  Reject: 'বাতিল করুন',
  Approve: 'অনুমোদন',
  Resolve: 'সমাধান করুন',
  Match: 'মিলান',
  'Match Client': 'ক্লায়েন্ট মিলান',
  'Mark reviewed': 'রিভিউ হয়েছে',
  Retry: 'আবার চেষ্টা',
  Logout: 'লগআউট',
  Login: 'লগইন',
  'Login ID': 'লগইন আইডি',
  Password: 'পাসওয়ার্ড',
  'Remember me': 'আমাকে মনে রাখুন',
  Show: 'দেখান',
  Hide: 'লুকান',
  'Live · ISP Billing': 'লাইভ · আইএসপি বিলিং',
  'Sign in': 'লগইন করুন',
  'Signing in…': 'লগইন হচ্ছে…',
  'Client Portal': 'ক্লায়েন্ট পোর্টাল',
  'ISP Billing Panel': 'আইএসপি বিলিং প্যানেল',
  'Live data': 'লাইভ ডেটা',
  'LIVE DATA': 'লাইভ ডেটা',
  'Live database': 'লাইভ ডেটাবেস',
  'bKash + Cash': 'bKash + ক্যাশ',
  'Demo data': 'ডেমো ডেটা',
  expired: 'মেয়াদোত্তীর্ণ',
  inactive: 'নিষ্ক্রিয়',
  free: 'ফ্রি',
  pending: 'অপেক্ষমাণ',
  reminder: 'রিমাইন্ডার',
  Jan: 'জানু',
  Feb: 'ফেব',
  Mar: 'মার্চ',
  Apr: 'এপ্রিল',
  Jun: 'জুন',
  Jul: 'জুলাই',
  Aug: 'আগস্ট',
  Sep: 'সেপ্টে',
  Oct: 'অক্টো',
  Nov: 'নভে',
  Dec: 'ডিসে',
  'Live mode': 'লাইভ মোড',
  'Financial snapshot': 'আর্থিক সারসংক্ষেপ',
  'Profit & Margin': 'লাভ ও মার্জিন',
  'Gross Margin': 'মোট মার্জিন',
  Revenue: 'রাজস্ব',
  'Revenue (excl. VAT)': 'রাজস্ব (ভ্যাট ছাড়া)',
  Margin: 'মার্জিন',
  Collection: 'কালেকশন',
  'Collected Today': 'আজ সংগৃহীত',
  'Collected (Nov)': 'সংগৃহীত (নভেম্বর)',
  'Due reminder': 'বকেয়া রিমাইন্ডার',
  Overdue: 'মেয়াদোত্তীর্ণ',
  'Last Login': 'শেষ লগইন',
  'Client Portal Logins': 'ক্লায়েন্ট পোর্টাল লগইন',
  'User Logins': 'ইউজার লগইন',
  'Change Audit': 'পরিবর্তনের অডিট',
  'Activity & Logs': 'অ্যাক্টিভিটি ও লগ',
  'Audit Detail': 'অডিট বিস্তারিত',
  'Sensitive Data Access': 'সংবেদনশীল তথ্য অ্যাক্সেস',
  Date: 'তারিখ',
  Time: 'সময়',
  'Last updated': 'শেষ আপডেট',
  Created: 'তৈরি হয়েছে',
  Updated: 'আপডেট হয়েছে',
  Name: 'নাম',
  Mobile: 'মোবাইল',
  'Mobile Number': 'মোবাইল নম্বর',
  Email: 'ইমেইল',
  Address: 'ঠিকানা',
  District: 'জেলা',
  Thana: 'থানা',
  Area: 'এলাকা',
  Areas: 'এলাকা',
  'Service Areas': 'সার্ভিস এলাকা',
  Client: 'ক্লায়েন্ট',
  Clients: 'ক্লায়েন্ট',
  'Client ID': 'ক্লায়েন্ট আইডি',
  'Client Profile': 'ক্লায়েন্ট প্রোফাইল',
  'Client Users': 'ক্লায়েন্ট ইউজার',
  'Assigned Clients': 'নির্ধারিত ক্লায়েন্ট',
  'User ID': 'ইউজার আইডি',
  User: 'ইউজার',
  Users: 'ইউজার',
  Role: 'রোল',
  Permissions: 'পারমিশন',
  Permission: 'পারমিশন',
  Status: 'স্ট্যাটাস',
  Package: 'প্যাকেজ',
  Packages: 'প্যাকেজ',
  'Package Name': 'প্যাকেজের নাম',
  Speed: 'স্পিড',
  Price: 'মূল্য',
  'Client Base Price': 'ক্লায়েন্ট মূল্য',
  'Upstream Cost': 'আপস্ট্রিম খরচ',
  'Avg. Package Price': 'গড় প্যাকেজ মূল্য',
  'Most Popular': 'সবচেয়ে জনপ্রিয়',
  Invoice: 'ইনভয়েস',
  Invoices: 'ইনভয়েস',
  'Invoice No': 'ইনভয়েস নম্বর',
  Payment: 'পেমেন্ট',
  Payments: 'পেমেন্ট',
  'Payment Inbox': 'পেমেন্ট ইনবক্স',
  'Payment Account': 'পেমেন্ট অ্যাকাউন্ট',
  'Payment Instructions': 'পেমেন্ট নির্দেশনা',
  Method: 'মাধ্যম',
  Provider: 'প্রোভাইডার',
  Amount: 'পরিমাণ',
  Subtotal: 'সাবটোটাল',
  Total: 'মোট',
  Discount: 'ডিসকাউন্ট',
  Tax: 'ট্যাক্স',
  VAT: 'ভ্যাট',
  Qty: 'পরিমাণ',
  Item: 'আইটেম',
  Items: 'আইটেম',
  Description: 'বর্ণনা',
  Details: 'বিস্তারিত',
  Type: 'ধরন',
  Transaction: 'লেনদেন',
  'Trx ID': 'Trx ID',
  Reference: 'রেফারেন্স',
  Sender: 'প্রেরক',
  'Sender Number': 'প্রেরকের নম্বর',
  'Sender ID': 'প্রেরক আইডি',
  Receiver: 'গ্রাহক',
  'Merchant Number': 'মার্চেন্ট নম্বর',
  'Personal Number': 'পার্সোনাল নম্বর',
  Merchant: 'মার্চেন্ট',
  Personal: 'পার্সোনাল',
  'Display Label': 'প্রদর্শিত লেবেল',
  Instructions: 'নির্দেশনা',
  'API Endpoint': 'API এন্ডপয়েন্ট',
  'API Key': 'API কী',
  Device: 'ডিভাইস',
  Session: 'সেশন',
  'Session + OTP relay': 'সেশন + OTP রিলে',
  Secret: 'গোপন কোড',
  'Not configured': 'কনফিগার করা হয়নি',
  'Kill switch': 'কিল সুইচ',
  'Global Auto-recharge': 'গ্লোবাল অটো-রিচার্জ',
  'Auto-recharge': 'অটো-রিচার্জ',
  'Approval Threshold': 'অনুমোদনের সীমা',
  'Rate (%)': 'হার (%)',
  'Grace Days': 'গ্রেস দিন',
  'Due Day': 'বকেয়া দিন',
  'Billing Type': 'বিলিং ধরন',
  'Monthly Amount': 'মাসিক পরিমাণ',
  'Software Name': 'সফটওয়্যারের নাম',
  'Logo (PNG / JPG / SVG)': 'লোগো (PNG / JPG / SVG)',
  'Logo': 'লোগো',
  'Brand Name': 'ব্র্যান্ডের নাম',
  'Payment Settings': 'পেমেন্ট সেটিংস',
  'SMS Settings': 'SMS সেটিংস',
  Settings: 'সেটিংস',
  Reports: 'রিপোর্ট',
  'Recharge History': 'রিচার্জ হিস্ট্রি',
  'Wrong Recharge': 'ভুল রিচার্জ',
  'Mobile Banking': 'মোবাইল ব্যাংকিং',
  Branding: 'ব্র্যান্ডিং',
  Admin: 'অ্যাডমিন',
  Staff: 'স্টাফ',
  'Super Admin': 'সুপার অ্যাডমিন',
  'Snapshot:': 'সারসংক্ষেপ:',
  'Retention:': 'সংরক্ষণ:',
  'Kill switch:': 'কিল সুইচ:',
  'SMS:': 'SMS:',
  Access: 'অ্যাক্সেস',
  Database: 'ডেটাবেস',
  'API Server': 'API সার্ভার',
  'Client ID / Invoice No': 'ক্লায়েন্ট আইডি / ইনভয়েস নম্বর',
  'Search & Recharge': 'সার্চ ও রিচার্জ',
  'Super Admin / Admin / Staff': 'সুপার অ্যাডমিন / অ্যাডমিন / স্টাফ',
  'Super Admin + Admin': 'সুপার অ্যাডমিন + অ্যাডমিন',
  'All Clients': 'সব ক্লায়েন্ট',
  'All Status': 'সব স্ট্যাটাস',
  'All Methods': 'সব মাধ্যম',
  'All Providers': 'সব প্রোভাইডার',
  'No data': 'কোনো ডেটা নেই',
  'No results': 'কোনো ফলাফল নেই',
  'No entries found': 'কোনো এন্ট্রি পাওয়া যায়নি',
  'No invoices found': 'কোনো ইনভয়েস পাওয়া যায়নি',
  'No payments found': 'কোনো পেমেন্ট পাওয়া যায়নি',
  'No clients found': 'কোনো ক্লায়েন্ট পাওয়া যায়নি',
  'No packages found': 'কোনো প্যাকেজ পাওয়া যায়নি',
  'No logs found': 'কোনো লগ পাওয়া যায়নি',
  'Loading…': 'লোড হচ্ছে…',
  'Loading...': 'লোড হচ্ছে...',
  'Saving…': 'সেভ হচ্ছে…',
  'Saving...': 'সেভ হচ্ছে...',
  'Searching…': 'খোঁজা হচ্ছে…',
  'Something went wrong': 'কিছু একটা সমস্যা হয়েছে',
  'Try again': 'আবার চেষ্টা করুন',
  'Page': 'পেজ',
  'of': 'এর',
  'entries': 'এন্ট্রি',
  'shown': 'দেখানো হচ্ছে',
  'This month': 'এই মাসে',
  'This year': 'এই বছরে',
  'Today': 'আজ',
  'Yesterday': 'গতকাল',
  'January': 'জানুয়ারি',
  'February': 'ফেব্রুয়ারি',
  'March': 'মার্চ',
  'April': 'এপ্রিল',
  'May': 'মে',
  'June': 'জুন',
  'July': 'জুলাই',
  'August': 'আগস্ট',
  'September': 'সেপ্টেম্বর',
  'October': 'অক্টোবর',
  'November': 'নভেম্বর',
  'December': 'ডিসেম্বর',
};

const PHRASES_LOWER = Object.fromEntries(
  Object.entries(PHRASES).map(([key, value]) => [key.toLowerCase(), value]),
);

const WORD_PATTERN = /[A-Za-z]+/g;

function translateTokens(value: string): string | null {
  const words = value.match(WORD_PATTERN);
  if (!words || words.length === 0) return null;

  let changed = false;
  const next = value.replace(WORD_PATTERN, (word) => {
    const translated = PHRASES_LOWER[word.toLowerCase()];
    if (translated) {
      changed = true;
      return translated;
    }
    return word;
  });

  if (!changed) return null;
  // Only use token translation when every English word is a known UI term;
  // this avoids translating client names and other user data.
  const unknown = words.some((word) => !PHRASES_LOWER[word.toLowerCase()]);
  return unknown ? null : next;
}

const PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^(\d+)\s+active$/i, (m) => `${m[1]} সক্রিয়`],
  [/^(\d+)\s+inactive$/i, (m) => `${m[1]} নিষ্ক্রিয়`],
  [/^(\d+)\s+expired$/i, (m) => `${m[1]} মেয়াদোত্তীর্ণ`],
  [/^(\d+)\s+free\.?$/i, (m) => `${m[1]} ফ্রি`],
  [/^(\d+)\s+invoice(?:s)? pending$/i, (m) => `${m[1]}টি ইনভয়েস বাকি`],
  [/^(\d+)\s+verified payments?$/i, (m) => `${m[1]}টি যাচাইকৃত পেমেন্ট`],
  [/^(\d+)\s+payments?$/i, (m) => `${m[1]}টি পেমেন্ট`],
  [/^(\d+)\s+clients?$/i, (m) => `${m[1]} ক্লায়েন্ট`],
  [/^(\d+)\s+shown$/i, (m) => `${m[1]}টি দেখানো হচ্ছে`],
  [/^(\d+)\s+entries$/i, (m) => `${m[1]}টি এন্ট্রি`],
  [/^(\d+)\s+SMS$/i, (m) => `${m[1]}টি SMS`],
  [/^Page\s+(\d+)\s+of\s+(\d+)$/i, (m) => `পেজ ${m[1]} / ${m[2]}`],
  [/^Showing\s+(.+)$/i, (m) => `দেখানো হচ্ছে ${m[1]}`],
  [/^(\d+)%\s+of total$/i, (m) => `মোটের ${m[1]}%`],
  [/^(\d+)%\s+online healthy$/i, (m) => `${m[1]}% অনলাইন সুস্থ`],
  [/^(\d+)\s+overdue$/i, (m) => `${m[1]}টি মেয়াদোত্তীর্ণ`],
];

const MIXED_WORDS: Array<[RegExp, string]> = [
  [/\bclients?\b/gi, 'ক্লায়েন্ট'],
  [/\bpayments?\b/gi, 'পেমেন্ট'],
  [/\binvoices?\b/gi, 'ইনভয়েস'],
  [/\bverified\b/gi, 'যাচাইকৃত'],
  [/\bverify\b/gi, 'যাচাই'],
  [/\bupstream\b/gi, 'আপস্ট্রিম'],
  [/\brecharge\b/gi, 'রিচার্জ'],
  [/\bprofit\b/gi, 'লাভ'],
  [/\bdue\b/gi, 'বকেয়া'],
  [/\bamount\b/gi, 'পরিমাণ'],
  [/\bnumber\b/gi, 'নম্বর'],
  [/\btoday\b/gi, 'আজ'],
  [/\bmonth\b/gi, 'মাস'],
  [/\bpackage\b/gi, 'প্যাকেজ'],
  [/\barea\b/gi, 'এলাকা'],
  [/\baddress\b/gi, 'ঠিকানা'],
  [/\bstatus\b/gi, 'স্ট্যাটাস'],
  [/\bsettings?\b/gi, 'সেটিংস'],
  [/\breports?\b/gi, 'রিপোর্ট'],
  [/\busers?\b/gi, 'ইউজার'],
  [/\brole\b/gi, 'রোল'],
  [/\bpermission\b/gi, 'পারমিশন'],
  [/\bsearch\b/gi, 'সার্চ'],
  [/\brefresh\b/gi, 'রিফ্রেশ'],
  [/\bsave\b/gi, 'সেভ'],
  [/\bdelete\b/gi, 'ডিলিট'],
  [/\baction\b/gi, 'অ্যাকশন'],
  [/\bprovider\b/gi, 'প্রোভাইডার'],
  [/\breference\b/gi, 'রেফারেন্স'],
  [/\bsender\b/gi, 'প্রেরক'],
  [/\bexpired\b/gi, 'মেয়াদোত্তীর্ণ'],
  [/\bactive\b/gi, 'সক্রিয়'],
  [/\binactive\b/gi, 'নিষ্ক্রিয়'],
  [/\bfree\b/gi, 'ফ্রি'],
  [/\bmanual\b/gi, 'ম্যানুয়াল'],
  [/\blive\b/gi, 'লাইভ'],
  [/\bpending\b/gi, 'অপেক্ষমাণ'],
  [/\bfailed\b/gi, 'ব্যর্থ'],
  [/\bqueued\b/gi, 'কিউতে'],
  [/\bactivated\b/gi, 'চালু'],
  [/\bmonthly\b/gi, 'মাসিক'],
];

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;

const originalText = new WeakMap<Text, string>();
const translatedText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
const translatedAttrs = new WeakMap<Element, Map<string, string>>();
let observer: MutationObserver | null = null;

function translateValue(value: string, language: string): string {
  if (language !== 'bn') return value;

  const lead = value.match(/^\s*/)?.[0] ?? '';
  const trail = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;

  const direct = PHRASES[core] ?? PHRASES_LOWER[core.toLowerCase()];
  if (direct) return `${lead}${direct}${trail}`;

  for (const [pattern, build] of PATTERNS) {
    const match = core.match(pattern);
    if (match) return `${lead}${build(match)}${trail}`;
  }

  if (/[\u0980-\u09FF]/.test(core)) {
    let next = core;
    for (const [pattern, replacement] of MIXED_WORDS) {
      next = next.replace(pattern, replacement);
    }
    return next === core ? value : `${lead}${next}${trail}`;
  }

  const tokens = translateTokens(core);
  if (tokens) return `${lead}${tokens}${trail}`;

  return value;
}

function shouldSkip(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('script, style, textarea, pre, code, [contenteditable="true"], [data-no-translate]')) {
    return true;
  }
  return false;
}

function applyTextNode(node: Text, language: string) {
  if (shouldSkip(node)) return;
  const current = node.nodeValue ?? '';
  if (language === 'en') {
    const original = originalText.get(node);
    const last = translatedText.get(node);
    // Only restore text we actually translated; if React already rendered the
    // English label, leave its value untouched.
    if (original !== undefined && last !== undefined && current === last) {
      node.nodeValue = original;
    }
    return;
  }

  const last = translatedText.get(node);
  if (current === last) return;

  let original = originalText.get(node);
  if (original === undefined || current !== last) {
    // React changed the node; treat the current value as the new source text.
    original = current;
    originalText.set(node, original);
  }

  const next = translateValue(original, language);
  if (next !== current) {
    node.nodeValue = next;
    translatedText.set(node, next);
  }
}

function applyAttributes(element: Element, language: string) {
  if (shouldSkip(element)) return;
  let map = originalAttrs.get(element);
  if (!map) {
    map = new Map();
    originalAttrs.set(element, map);
  }
  let lastMap = translatedAttrs.get(element);
  if (!lastMap) {
    lastMap = new Map();
    translatedAttrs.set(element, lastMap);
  }

  for (const attr of ATTRS) {
    const current = element.getAttribute(attr);
    if (current === null) continue;

    if (language === 'en') {
      const original = map.get(attr);
      const last = lastMap.get(attr);
      if (original !== undefined && last !== undefined && current === last) {
        element.setAttribute(attr, original);
      }
      continue;
    }

    if (!map.has(attr)) map.set(attr, current);
    const source = map.get(attr) ?? current;
    const next = translateValue(source, language);
    if (next !== current) {
      element.setAttribute(attr, next);
      lastMap.set(attr, next);
    }
  }
}

function walk(root: Node, language: string) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyTextNode(root as Text, language);
    return;
  }
  if (!(root instanceof Element) && root.nodeType !== Node.DOCUMENT_NODE) return;

  if (root instanceof Element) applyAttributes(root, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node !== root) {
      if (node.nodeType === Node.TEXT_NODE) applyTextNode(node as Text, language);
      else if (node instanceof Element) applyAttributes(node, language);
    }
    node = walker.nextNode();
  }
}

export function AutoTranslate() {
  const { language } = useI18n();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const run = (root: Node = document.body) => walk(root, language);
    run();

    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          applyTextNode(mutation.target as Text, language);
        } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          applyAttributes(mutation.target, language);
        } else {
          mutation.addedNodes.forEach((node) => walk(node, language));
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => {
      observer?.disconnect();
      observer = null;
    };
  }, [language]);

  return null;
}
