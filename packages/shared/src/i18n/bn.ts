/**
 * The Bengali dictionary — and the shape every other locale must match.
 *
 * The product is Bengali-first, so this file is the source of truth for user
 * visible text and English appears only where the Bengali term would be less
 * clear to a Bangladeshi business user than the borrowed one (MFS, PDF).
 *
 * `Dictionary` is derived from this object rather than declared separately, so
 * adding a key here without adding it to `./en` is a compile error at the
 * `const en: Dictionary` annotation rather than an English screen with a
 * Bengali word left in it.
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
  TransactionLineRole,
  TransactionStatus,
  TransactionType,
} from "../types";

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
  notifications: "বিজ্ঞপ্তি",
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
  amount: "টাকার পরিমাণ",
  lineRole: "ভূমিকা",
  countedQuantity: "গণনায় পাওয়া পরিমাণ",
  recipe: "রেসিপি",
  batchCount: "কত ব্যাচ",
  yield: "প্রত্যাশিত উৎপাদন",
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
  lastSixMonths: "গত ৬ মাস",
  balancesHeading: "ব্যালেন্স",
  thisMonthHeading: "চলতি মাস",
  duesAndStockHeading: "বকেয়া ও স্টক",
  lowStockAlert: (product: string, current: string, minimum: string) =>
    `${product} — স্টক ${current}, সর্বনিম্ন ${minimum}`,
  customersOwing: (count: string) => `কাস্টমারদের কাছে মোট ${count} জনের বকেয়া আছে`,
  /* Chart series names — short, because they sit in a legend under the plot. */
  seriesIncome: "আয়",
  seriesExpense: "ব্যয়",
  seriesSales: "বিক্রয়",
  seriesProfit: "লাভ",
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

/**
 * What a voucher line is *for*.
 *
 * A production voucher lists raw materials and finished goods in the same
 * table, and without this they read as one undifferentiated list of products
 * that happened to be involved.
 */
export const transactionLineRole: Record<TransactionLineRole, string> = {
  item: "পণ্য",
  input: "কাঁচামাল",
  output: "উৎপাদিত",
  wastage: "অপচয়",
  adjustment: "গণনা",
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

/**
 * The transaction list and the voucher view.
 */
export const transactions = {
  searchPlaceholder: "ভাউচার, মেমো, নাম",
  all: "সব",
  start: "শুরু",
  end: "শেষ",
  includeCancelled: "বাতিল হওয়া লেনদেনও দেখান",
  count: (count: string) => `${count} টি লেনদেন`,

  cancelledNotice: (reason: string | null) =>
    reason
      ? `এই লেনদেনটি বাতিল করা হয়েছে — ${reason}। মূল এন্ট্রি মোছা হয়নি; এর প্রভাব একটি বিপরীত এন্ট্রি দিয়ে বাতিল করা হয়েছে।`
      : "এই লেনদেনটি বাতিল করা হয়েছে। মূল এন্ট্রি মোছা হয়নি; এর প্রভাব একটি বিপরীত এন্ট্রি দিয়ে বাতিল করা হয়েছে।",
  summary: "সারসংক্ষেপ",
  details: "বিস্তারিত",
  source: "উৎস",
  createdBy: "তৈরি করেছেন",
  createdAt: "তৈরির সময়",
  stockEffect: "স্টক প্রভাব",
  ledger: "হিসাবের খাতা",
  ledgerNote: "স্বয়ংক্রিয়ভাবে তৈরি — কিছু লিখতে হয়নি",
  accountColumn: "হিসাব",
  narrationColumn: "বিবরণ",
  debitColumn: "ডেবিট",
  creditColumn: "ক্রেডিট",

  cancelTitle: "লেনদেন বাতিল করবেন?",
  cancelBody: (voucherNo: string) =>
    `${voucherNo} মুছে যাবে না। এর প্রভাব বাতিল করতে একটি বিপরীত এন্ট্রি তৈরি হবে, এবং দুটোই হিসাবের খাতায় থেকে যাবে।`,
  cancelReason: "বাতিলের কারণ",
  cancelReasonPlaceholder: "যেমন: ভুল কাস্টমারের নামে এন্ট্রি হয়েছিল",
  reversalCreated: (voucherNo: string) => `বিপরীত এন্ট্রি ${voucherNo}`,
} as const;

/**
 * The reports section.
 *
 * Reports are the one part of the product that routinely leaves the building —
 * printed and carried to a customer, or emailed to an accountant — so this is
 * the group most likely to be read in English by someone who is not the
 * shopkeeper.
 */
export const reports = {
  index: "রিপোর্ট",
  indexHint: "প্রতিটি রিপোর্ট খাতা থেকে সরাসরি তৈরি — তারিখ বেছে নিয়ে প্রিন্ট করা যায়",

  profitLoss: "লাভ-ক্ষতি",
  profitLossHint: "আয়, ব্যয়, মোট মুনাফা ও নিট লাভ — খাত অনুযায়ী",
  dues: "বকেয়া ও পাওনা",
  duesHint: "কার টাকা কত দিন ধরে আটকে আছে, বয়স অনুযায়ী ভাগ করা",
  register: "বিক্রয় ও ক্রয়",
  registerHint: "কার কাছে কত বিক্রি, কোন পণ্য কত গেল",
  stock: "স্টক রিপোর্ট",
  stockHint: "প্রারম্ভিক, আগমন, নির্গমন ও সমাপনী স্টক",
  cashBook: "ক্যাশ বই",
  cashBookHint: "নগদ, ব্যাংক ও MFS-এর প্রতিটি জমা-খরচ",

  fromDate: "শুরুর তারিখ",
  toDate: "শেষ তারিখ",
  asOfDate: "কোন তারিখ পর্যন্ত",
  asOfLine: (date: string) => `${date} পর্যন্ত`,
  rangeLine: (from: string, to: string) => `${from} — ${to}`,
  generatedLine: (date: string) => `HishabAI থেকে তৈরি — ${date}`,

  withCogs: "বিক্রীত পণ্যের ব্যয়সহ",
  inProfit: "লাভে আছেন",
  inLoss: "ক্ষতিতে আছেন",

  // --- লাভ-ক্ষতি ---
  profitLossDescription: "নির্বাচিত সময়ে কত আয় হলো, কত খরচ হলো, আর হাতে কত থাকল",
  atAverageCost: "গড় ক্রয়মূল্যে হিসাব করা",
  grossProfit: "মোট মুনাফা",
  grossProfitFormula: "বিক্রয় − পণ্যের ব্যয়",
  netProfitFootnote: "সব খরচ বাদ দেওয়ার পর",
  netProfitFormula: "মোট আয় − মোট ব্যয়",
  noIncomeOrExpense: "এই সময়ে কোনো আয় বা ব্যয় নেই",
  noIncomeOrExpenseHint: "অন্য তারিখ বেছে দেখুন, অথবা প্রথম এন্ট্রিটি করুন",
  noIncome: "এই সময়ে কোনো আয় হয়নি",
  noExpense: "এই সময়ে কোনো ব্যয় হয়নি",
  accountColumn: "খাত",
  amountColumn: "পরিমাণ",
  sectionTotal: (section: string) => `মোট ${section}`,

  // --- ক্যাশ বই ---
  cashBookDescription: "নগদ, ব্যাংক ও মোবাইল ব্যাংকিং-এ প্রতিটি টাকা কোথা থেকে এলো, কোথায় গেল",
  allMethods: "সব মাধ্যম",
  openingBefore: (date: string) => `${date} তারিখের আগে পর্যন্ত`,
  totalIn: "মোট জমা",
  totalOut: "মোট খরচ",
  closingBalance: "সমাপনী ব্যালেন্স",
  closingFormula: "প্রারম্ভিক + জমা − খরচ",
  currentBalance: "বর্তমান ব্যালেন্স",
  entryCount: (count: string) => `${count} টি লেনদেন`,
  noCashMovement: "এই সময়ে কোনো জমা-খরচ নেই",
  noCashMovementHint: "অন্য তারিখ বা অন্য মাধ্যম বেছে দেখুন",
  inColumn: "জমা",
  outColumn: "খরচ",
  balanceColumn: "ব্যালেন্স",
  entry: "লেনদেন",

  // --- বকেয়া ও পাওনা ---
  agingTitle: (side: string) => `${side} — বয়স বিশ্লেষণ`,
  agingDescription: (date: string) => `${date} পর্যন্ত কার টাকা কত দিন ধরে আটকে আছে`,
  agingBucket0: "০–৩০ দিন",
  agingBucket31: "৩১–৬০ দিন",
  agingBucket61: "৬১–৯০ দিন",
  agingBucket90: "৯০+ দিন",
  whichSide: "কোন দিক",
  totalOf: (side: string) => `মোট ${side}`,
  peopleOwing: "বকেয়া আছে যাদের",
  peopleOwed: "পাওনা আছে যাদের",
  personCount: (count: string) => `${count} জন`,
  people: "জন",
  olderThan60: "৬০ দিনের বেশি পুরোনো",
  chaseTheseFirst: "এগুলোই আগে তাড়া দেওয়ার মতো",
  fifoNote: "পুরোনো বিল আগে শোধ হয়েছে ধরে হিসাব করা",
  noReceivables: "কারও কাছে বকেয়া নেই",
  noPayables: "কারও পাওনা নেই",
  everyoneSettled: "সবাই পরিশোধ করে দিয়েছে",
  totalColumn: "মোট",
  grandTotalRow: "সর্বমোট",
  days: (count: string) => `${count} দিন`,
  oldestDays: (count: string) => `সবচেয়ে পুরোনো ${count} দিন`,
  chase: "তাড়া দিন",
  normal: "স্বাভাবিক",

  // --- বিক্রয় ও ক্রয় ---
  salesRegister: "বিক্রয় রিপোর্ট",
  purchaseRegister: "ক্রয় রিপোর্ট",
  registerDescriptionSale: "নির্বাচিত সময়ে কার কাছে কত বিক্রি হলো, আর কোন পণ্য কত গেল",
  registerDescriptionPurchase: "নির্বাচিত সময়ে কার কাছ থেকে কত কেনা হলো, আর কোন পণ্য কত এলো",
  totalSales: "মোট বিক্রয়",
  totalPurchases: "মোট ক্রয়",
  cashMoved: "নগদ পাওয়া/দেওয়া",
  cashMovedHint: "যত টাকা হাতবদল হয়েছে",
  entryCountLabel: "লেনদেন সংখ্যা",
  countSuffix: "টি",
  noSales: "এই সময়ে কোনো বিক্রয় নেই",
  noPurchases: "এই সময়ে কোনো ক্রয় নেই",
  tryAnotherRange: "অন্য তারিখ বেছে দেখুন",
  byParty: (party: string) => `${party} অনুযায়ী`,
  byProduct: "পণ্য অনুযায়ী",
  paidColumn: "পরিশোধ",
  entriesCount: (count: string) => `${count} টি লেনদেন`,
  noProductsInvolved: "কোনো পণ্য যুক্ত ছিল না",
  noProductsInvolvedHint: "এই সময়ের লেনদেনগুলো পণ্যবিহীন ছিল",
  lineValueColumn: "মোট মূল্য",
  avgRateColumn: "গড় দর",

  // --- স্টক ---
  stockDescription: "সময়ের শুরুতে কত ছিল, কত ঢুকল, কত বেরোল, আর শেষে কত রইল",
  openingStockValue: "প্রারম্ভিক স্টক ভ্যালু",
  closingStockValue: "সমাপনী স্টক ভ্যালু",
  onDate: (date: string) => `${date} তারিখে`,
  stockChange: "পরিবর্তন",
  stockUp: "স্টক বেড়েছে",
  stockDown: "স্টক কমেছে",
  productCount: (count: string) => `${count} টি পণ্য`,
  stockValueNote: "প্রতিটি মুভমেন্টে জমা থাকা ব্যালেন্স থেকে নেওয়া",
  addProductsFirst: "প্রথমে পণ্য যোগ করুন",
  openingColumn: "প্রারম্ভিক",
  inMovementColumn: "আগমন",
  outMovementColumn: "নির্গমন",
  closingColumn: "সমাপনী",
  stockValueColumn: "স্টক ভ্যালু",
} as const;

/**
 * Month names for the long date form — "১৯ আগস্ট ২০২৬" reads as a date, where
 * "19/08/2026" reads as a code. Digits stay English in both locales, per the
 * numeral decision; only the month word changes.
 */
export const months = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
] as const;

/** The axis form — a month label has to fit under a bar. */
export const monthsShort = [
  "জানু",
  "ফেব",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্ট",
  "অক্টো",
  "নভে",
  "ডিসে",
] as const;

/**
 * The application chrome — the parts of the page that are not a screen.
 *
 * Sidebar, top bar, notification bell, the required-field star. They were
 * literals in the components, which was invisible until a second locale
 * existed and half the frame stayed Bengali.
 */
export const shell = {
  mainMenu: "প্রধান মেনু",
  company: "কোম্পানি",
  switchCompany: "কোম্পানি পরিবর্তন করুন",
  searchPlaceholder: "কাস্টমার, পণ্য, মেমো, ভাউচার…",
  user: "ব্যবহারকারী",
  /** Brand line. Deliberately bilingual, and identical in both locales. */
  tagline: "Smart হিসাব, Smarter Business",
  /** The product promise, and the line under every page title. */
  motto: "একবার লিখুন — বাকিটা HishabAI করবে",
  appDescription: "বাংলায় ব্যবসার সম্পূর্ণ হিসাব — একবার লিখুন, বাকিটা HishabAI করবে।",
  markAllRead: "সব পড়া হয়েছে",
  noNotifications: "এখন কিছু দেখার নেই।",
  notificationsWithCount: (count: string) => `বিজ্ঞপ্তি — ${count}টি`,
  printPdf: "প্রিন্ট / PDF",
  required: "আবশ্যক",
  toLightTheme: "দিনের রঙে দেখুন",
  toDarkTheme: "রাতের রঙে দেখুন",
} as const;

export const emptyStates = {
  noTransactions: "এখনো কোনো লেনদেন নেই",
  noTransactionsHint: "প্রথম এন্ট্রি যোগ করে শুরু করুন",
  noCustomers: "এখনো কোনো কাস্টমার যোগ করা হয়নি",
  noVendors: "এখনো কোনো ভেন্ডর যোগ করা হয়নি",
  noProducts: "এখনো কোনো পণ্য যোগ করা হয়নি",
  noAlerts: "কোনো সতর্কতা নেই",
  noDues: "কারও বকেয়া নেই",
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
  transactionLineRole,
  accountSubtype,
  severity,
  messages,
  emptyStates,
  shell,
  transactions,
  reports,
  months,
  monthsShort,
} as const;

/**
 * The literal strings widened back to `string`.
 *
 * `bn` is `as const`, which makes every value its own literal type — without
 * this, `const en: Dictionary` would demand that English read
 * "ড্যাশবোর্ড" too. Keys stay exact; only the leaves are widened.
 */
type Widen<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : // Parametrised messages are functions, not templates with a `{n}` in
      // them: "স্টক কমে গেছে — ৫টি" needs the number in a different place in
      // each language, and a function lets the dictionary decide where.
      T[K] extends (...args: infer A) => infer R
      ? (...args: A) => R
      : Widen<T[K]>;
};

export type Dictionary = Widen<typeof bn>;
