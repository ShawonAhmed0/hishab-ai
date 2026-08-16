/**
 * Bengali label dictionary.
 *
 * The product is Bengali-first, so this file is the source of truth for user
 * visible text and English appears only where the Bengali term would be less
 * clear to a Bangladeshi business user than the borrowed one (MFS, PDF).
 */
import type {
  AccountSubtype,
  FinancialAccountKind,
  MfsProvider,
  NotificationSeverity,
  PartyType,
  ProductKind,
  Role,
  StockMovementType,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "./types";

export const nav = {
  dashboard: "ড্যাশবোর্ড",
  newEntry: "নতুন এন্ট্রি",
  transactions: "হিসাব",
  inventory: "ইনভেন্টরি",
  customers: "কাস্টমার",
  vendors: "ভেন্ডর",
  reports: "রিপোর্ট",
  users: "ব্যবহারকারী",
  settings: "সেটিংস",
} as const;

export const actions = {
  save: "এন্ট্রি সংরক্ষণ করুন",
  saveShort: "সংরক্ষণ করুন",
  addNew: "নতুন যোগ করুন",
  edit: "সম্পাদনা করুন",
  cancel: "বাতিল করুন",
  confirm: "নিশ্চিত করুন",
  print: "প্রিন্ট করুন",
  download: "ডাউনলোড করুন",
  search: "খুঁজুন",
  filter: "ফিল্টার",
  clear: "মুছুন",
  back: "ফিরে যান",
  next: "পরবর্তী",
  review: "যাচাই করুন",
  close: "বন্ধ করুন",
  retry: "আবার চেষ্টা করুন",
  viewAll: "সব দেখুন",
  logout: "লগআউট",
} as const;

export const transactionType: Record<TransactionType, string> = {
  income: "আয়",
  expense: "ব্যয়",
  sale: "বিক্রয়",
  purchase: "ক্রয়",
  customer_payment: "কাস্টমার পেমেন্ট",
  vendor_payment: "ভেন্ডর পেমেন্ট",
  production: "উৎপাদন",
  stock_adjustment: "স্টক সমন্বয়",
  sale_return: "বিক্রয় রিটার্ন",
  purchase_return: "ক্রয় রিটার্ন",
  other: "অন্যান্য",
};

/** One-line hint under each type on নতুন এন্ট্রি — plain language, no jargon. */
export const transactionTypeHint: Record<TransactionType, string> = {
  income: "ব্যবসায় টাকা এসেছে, কিন্তু পণ্য বিক্রি নয়",
  expense: "ব্যবসা থেকে টাকা খরচ হয়েছে",
  sale: "কাস্টমারের কাছে পণ্য বিক্রি করেছেন",
  purchase: "ভেন্ডরের কাছ থেকে পণ্য কিনেছেন",
  customer_payment: "কাস্টমার বকেয়া টাকা পরিশোধ করেছে",
  vendor_payment: "ভেন্ডরকে পাওনা টাকা পরিশোধ করেছেন",
  production: "কাঁচামাল থেকে পণ্য তৈরি করেছেন",
  stock_adjustment: "গণনার পর স্টকের পরিমাণ ঠিক করছেন",
  sale_return: "কাস্টমার পণ্য ফেরত দিয়েছে",
  purchase_return: "ভেন্ডরকে পণ্য ফেরত দিয়েছেন",
  other: "উপরের কোনোটিতে পড়ে না",
};

export const fields = {
  date: "তারিখ",
  type: "লেনদেনের ধরন",
  category: "খাত",
  customer: "কাস্টমার",
  vendor: "ভেন্ডর",
  party: "কাস্টমার/ভেন্ডর",
  product: "পণ্যের নাম",
  quantity: "পরিমাণ",
  pieces: "পিস",
  unit: "একক",
  rate: "একক দর",
  lineTotal: "মোট মূল্য",
  transportCost: "পরিবহন খরচ",
  laborCost: "লেবার খরচ",
  otherCost: "অন্যান্য খরচ",
  discount: "ছাড়",
  grandTotal: "সর্বমোট",
  paidAmount: "পেমেন্টের পরিমাণ",
  dueAmount: "বকেয়া",
  paymentMethod: "পেমেন্ট মাধ্যম",
  handledBy: "টাকা গ্রহণকারী/প্রদানকারী",
  memoNo: "মেমো নম্বর",
  voucherNo: "ভাউচার নম্বর",
  description: "বিবরণ",
  attachment: "ডকুমেন্ট/রসিদ",
  name: "নাম",
  phone: "মোবাইল",
  address: "ঠিকানা",
  openingBalance: "প্রারম্ভিক ব্যালেন্স",
  creditLimit: "ক্রেডিট সীমা",
  minStock: "সর্বনিম্ন স্টক",
  purchasePrice: "ক্রয় মূল্য",
  salePrice: "বিক্রয় মূল্য",
  avgCost: "গড় মূল্য",
  wastage: "অপচয়",
  outputProduct: "উৎপাদিত পণ্য",
  inputProduct: "কাঁচামাল",
} as const;

export const dashboard = {
  cash: "বর্তমান ক্যাশ",
  bank: "ব্যাংক ব্যালেন্স",
  mfs: "MFS ব্যালেন্স",
  monthIncome: "চলতি মাসের আয়",
  monthExpense: "চলতি মাসের ব্যয়",
  netProfit: "নিট লাভ",
  customerDue: "কাস্টমারের মোট বকেয়া",
  vendorPayable: "ভেন্ডরের মোট পাওনা",
  stockValue: "মোট স্টক ভ্যালু",
  todayTransactions: "আজকের লেনদেন",
  recentTransactions: "সাম্প্রতিক লেনদেন",
  recentSales: "সাম্প্রতিক বিক্রয়",
  recentPurchases: "সাম্প্রতিক ক্রয়",
  dueCustomers: "বকেয়া কাস্টমার",
  alerts: "গুরুত্বপূর্ণ সতর্কতা",
  incomeVsExpense: "আয় বনাম ব্যয়",
  salesTrend: "বিক্রয়ের প্রবণতা",
  profitTrend: "লাভের প্রবণতা",
  dueTrend: "বকেয়া",
  stockChart: "স্টক",
} as const;

export const due = {
  previousDue: "পূর্বের বকেয়া",
  currentBill: "বর্তমান বিল",
  payment: "পরিশোধ",
  newDue: "নতুন বকেয়া",
  statement: "বকেয়া বিবরণী",
} as const;

export const role: Record<Role, string> = {
  admin: "অ্যাডমিন",
  manager: "ম্যানেজার",
  operator: "ডেটা এন্ট্রি অপারেটর",
};

export const financialAccountKind: Record<FinancialAccountKind, string> = {
  cash: "নগদ",
  bank: "ব্যাংক",
  mfs: "মোবাইল ব্যাংকিং",
};

export const mfsProvider: Record<MfsProvider, string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  other: "অন্যান্য",
};

export const partyType: Record<PartyType, string> = {
  customer: "কাস্টমার",
  vendor: "ভেন্ডর",
  both: "উভয়",
};

export const productKind: Record<ProductKind, string> = {
  raw_material: "কাঁচামাল",
  finished_good: "উৎপাদিত পণ্য",
  service: "সেবা",
};

export const transactionStatus: Record<TransactionStatus, string> = {
  posted: "সক্রিয়",
  cancelled: "বাতিল",
};

export const transactionSource: Record<TransactionSource, string> = {
  manual: "হাতে লেখা",
  voice: "ভয়েস",
  scan: "স্ক্যান",
  import: "ইমপোর্ট",
};

export const stockMovementType: Record<StockMovementType, string> = {
  opening: "প্রারম্ভিক",
  purchase: "ক্রয়",
  sale: "বিক্রয়",
  production_input: "উৎপাদনে ব্যবহৃত",
  production_output: "উৎপাদিত",
  wastage: "অপচয়",
  adjustment: "সমন্বয়",
  sale_return: "বিক্রয় ফেরত",
  purchase_return: "ক্রয় ফেরত",
  reversal: "বিপরীত এন্ট্রি",
};

export const accountSubtype: Record<AccountSubtype, string> = {
  cash: "নগদ",
  bank: "ব্যাংক",
  mfs: "মোবাইল ব্যাংকিং",
  receivable: "কাস্টমার বকেয়া",
  payable: "ভেন্ডর পাওনা",
  inventory: "স্টক",
  fixed_asset: "স্থায়ী সম্পদ",
  accumulated_depreciation: "পুঞ্জীভূত অবচয়",
  sales: "বিক্রয়",
  sales_return: "বিক্রয় ফেরত",
  other_income: "অন্যান্য আয়",
  cogs: "বিক্রীত পণ্যের ব্যয়",
  wastage: "অপচয়",
  operating_expense: "পরিচালন ব্যয়",
  stock_adjustment: "স্টক সমন্বয়",
  capital: "মূলধন",
  drawings: "উত্তোলন",
  opening_balance_equity: "প্রারম্ভিক ব্যালেন্স",
};

export const severity: Record<NotificationSeverity, string> = {
  info: "তথ্য",
  warning: "সতর্কতা",
  critical: "জরুরি",
};

export const messages = {
  saved: "এন্ট্রি সংরক্ষণ হয়েছে",
  cancelled: "লেনদেন বাতিল করা হয়েছে",
  errorTitle: "একটি সমস্যা হয়েছে",
  errorGeneric: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  required: "এই ঘরটি পূরণ করা আবশ্যক",
  mustBePositive: "শূন্যের চেয়ে বড় সংখ্যা দিন",
  paidExceedsTotal: "পেমেন্ট মোট মূল্যের চেয়ে বেশি হতে পারে না",
  insufficientStock: "পর্যাপ্ত স্টক নেই",
  noResults: "কোনো ফলাফল পাওয়া যায়নি",
  loading: "লোড হচ্ছে…",
  lowStock: "স্টক কমে গেছে",
  reviewBeforeSave: "সংরক্ষণের আগে তথ্যগুলো যাচাই করুন",
} as const;

export const emptyStates = {
  noTransactions: "এখনো কোনো লেনদেন নেই",
  noTransactionsHint: "প্রথম এন্ট্রি যোগ করে শুরু করুন",
  noCustomers: "এখনো কোনো কাস্টমার যোগ করা হয়নি",
  noVendors: "এখনো কোনো ভেন্ডর যোগ করা হয়নি",
  noProducts: "এখনো কোনো পণ্য যোগ করা হয়নি",
  noAlerts: "কোনো সতর্কতা নেই",
} as const;

export const bn = {
  nav,
  actions,
  transactionType,
  transactionTypeHint,
  fields,
  dashboard,
  due,
  role,
  financialAccountKind,
  mfsProvider,
  partyType,
  productKind,
  transactionStatus,
  transactionSource,
  stockMovementType,
  accountSubtype,
  severity,
  messages,
  emptyStates,
} as const;

export type Dictionary = typeof bn;
