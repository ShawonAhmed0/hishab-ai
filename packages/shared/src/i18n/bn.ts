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
  ActivityStatus,
  DeliveryStatus,
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
  customerHealth: "কাস্টমারের অবস্থা",
  vendors: "ভেন্ডর",
  reports: "রিপোর্ট",
  users: "ব্যবহারকারী",
  settings: "সেটিংস",
  notifications: "বিজ্ঞপ্তি",
  more: "আরও",
} as const;

/** Sidebar group headings — see NAV_GROUPS for why these three. */
export const navGroup = {
  everyday: "রোজকার",
  records: "খাতা",
  admin: "ব্যবস্থাপনা",
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
  clearFilters: "ফিল্টার মুছুন",
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
  giverName: "যিনি দিয়েছেন",
  recipientName: "যিনি নিয়েছেন",
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
  oneMonthOnly: "প্রবণতা দেখতে অন্তত দুই মাসের হিসাব লাগে",
  dateRange: "সময়কাল",
  periodFrom: "শুরু",
  periodTo: "শেষ",
  applyRange: "দেখুন",
  thisMonth: "চলতি মাস",
  vsPrevious: "আগের সময়ের তুলনায়",
  noComparison: "আগে কিছু ছিল না",
  deltaUp: (percent: string) => `${percent}% বেশি`,
  deltaDown: (percent: string) => `${percent}% কম`,
  deltaFlat: "আগের সমান",
  /* One-tap ranges. `thisMonth` above is the same period; these are the
     chips beside the date inputs. */
  rangeLastMonth: "গত মাস",
  rangeThreeMonths: "৩ মাস",
  rangeThisYear: "চলতি বছর",
  rangeCustom: "নিজের মতো",
  rangeHeading: "সময়কাল বেছে নিন",
  shareOfTotal: (percent: string) => `মোট টাকার ${percent}%`,
  netOwedToYou: (amount: string) => `নিট ${amount} আপনার পাওনা`,
  netYouOwe: (amount: string) => `নিট ${amount} আপনার দেনা`,
  netSettled: "পাওনা আর দেনা সমান",
  balancesHeading: "টাকা কোথায় আছে",
  noBalances: "কোনো মাধ্যমে টাকা নেই",
  thisMonthHeading: "চলতি মাস",
  duesAndStockHeading: "বকেয়া ও স্টক",
  figuresHeading: "মূল হিসাব",
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
  fixTheFields: "কিছু তথ্য ঠিক নেই। নিচের ঘরগুলো দেখুন।",
  alreadyExists: "এই নামে বা কোডে একটি এন্ট্রি আগে থেকেই আছে",
  cancelFailed: "বাতিল করা যায়নি। আবার চেষ্টা করুন।",
  cancelReasonRequired: "বাতিলের কারণ লিখুন",
  companyCreateFailed: "কোম্পানি তৈরি করা যায়নি",
  notAllowed: "এই কাজটি করার অনুমতি আপনার নেই।",
} as const;

/**
 * Creating a company — the one screen a brand-new user sees first.
 */
export const onboarding = {
  title: "কোম্পানি যোগ করুন",
  subtitle: "প্রতিটি কোম্পানির হিসাব সম্পূর্ণ আলাদা থাকে",
  companyName: "কোম্পানির নাম",
  companyNameHint: "রিপোর্ট ও প্রিন্টে এই নামটি দেখাবে",
  bengaliName: "বাংলা নাম",
  bengaliNamePlaceholder: "পেপার স্টার",
  businessType: "ব্যবসার ধরন",
  businessTypePlaceholder: "কাগজ ব্যবসা",
  fiscalYearStart: "হিসাব বছর শুরু",
  fiscalYearHint: "বাংলাদেশে সাধারণত জুলাই থেকে শুরু হয়",
  createCompany: "কোম্পানি তৈরি করুন",
} as const;

/**
 * নতুন এন্ট্রি — the screen the whole product is built around.
 *
 * "একবার লিখুন — বাকিটা HishabAI করবে" is written here more than anywhere
 * else: most of these strings exist to tell the user what the system is about
 * to work out for them, so they never have to.
 */
export const entry = {
  motto: "একবার লিখুন — হিসাব, স্টক আর বকেয়া নিজে থেকেই ঠিক হয়ে যাবে",
  discountType: "ছাড়ের ধরন",
  discountAmount: "টাকায়",
  discountPercent: "শতাংশ",
  discountWorksOutTo: (amount: string) => `ছাড় দাঁড়াচ্ছে ${amount}`,
  addCost: "খরচ যোগ করুন",
  costKind: "খরচের ধরন",
  costName: "খরচের নাম",
  costNamePlaceholder: "যেমন ক্রেন ভাড়া",
  costAmount: "টাকা",
  removeCost: (n: string) => `${n} নম্বর খরচ বাদ দিন`,
  costsHint: "পরিবহন ও লেবার পণ্যের দামে যোগ হয়; বাকিগুলো নিজের খাতে খরচ হিসেবে বসে",
  costsHintSale: "সব খরচ কাস্টমারের বিলে যোগ হবে",
  costCapitalised: "পণ্যের দামে যোগ হবে",
  giverHint: "কে দিয়ে গেল — নাম লিখলে রসিদে ছাপা হবে",
  recipientHint: "কে বুঝে নিল",
  savedTitle: "এন্ট্রি সংরক্ষণ হয়েছে",
  savedAnother: "আরেকটি এন্ট্রি",
  showMoreTypes: "আরও ধরন দেখান",
  showFewerTypes: "কম দেখান",
  details: "বিস্তারিত",
  choosePrompt: "— নির্বাচন করুন —",
  nothingAdded: "কিছু যোগ করা হয়নি।",
  lines: "লাইন",
  line: "লাইন",
  products: "পণ্য",
  removeLine: (index: string) => `লাইন ${index} মুছুন`,
  removeTitledLine: (title: string, index: string) => `${title} — লাইন ${index} মুছুন`,
  removePayment: (index: string) => `পেমেন্ট ${index} মুছুন`,
  totalIs: "মোট",
  account: "হিসাব",
  method: "মাধ্যম",
  reason: "কারণ",
  stockIs: (quantity: string) => `স্টক ${quantity}`,
  ratePlaceholder: "১২৫",

  savedTotal: (total: string) => `সর্বমোট ${total}`,

  // --- উৎপাদন ---
  recipeHint: "রেসিপি বেছে নিলে কাঁচামাল নিজে থেকেই বসে যাবে — পরে বদলানো যাবে",
  withoutRecipe: "— রেসিপি ছাড়া —",
  inputsHint: "যা ব্যবহার করা হয়েছে — দর লাগবে না, চলতি গড় মূল্যেই ধরা হবে",
  outputsHint: "যা তৈরি হয়েছে — কাঁচামালের খরচ পরিমাণ অনুপাতে ভাগ হয়ে যাবে",
  wastageHint: "নষ্ট হওয়া কাঁচামাল — উপরের কাঁচামালের তালিকা থেকেই হতে হবে",
  conversionCostNotice: (cost: string, paid: string) =>
    `লেবার ও অন্যান্য খরচ ${cost} — নিচে ঠিক এই পরিমাণ পেমেন্ট মাধ্যম থেকে দিতে হবে। এখন দেওয়া আছে ${paid}।`,

  // --- স্টক সমন্বয় ---
  countHint: "গুদামে গুনে যা পাওয়া গেল সেটাই লিখুন — কমবেশি হিসাব নিজে করে নেবে",
  countMatches: "স্টকের সঙ্গে মিলে গেছে",
  countSurplus: (quantity: string) => `${quantity} বেশি পাওয়া গেছে`,
  countShortfall: (quantity: string) => `${quantity} কম পাওয়া গেছে`,

  // --- অন্যান্য ---
  fromWhere: "কোথা থেকে",
  fromWhereHint: "টাকাটা যেখান থেকে এসেছে",
  toWhere: "কোথায়",
  toWhereHint: "টাকাটা যেখানে গেছে",
  journalUnbalanced: (difference: string) => `দুই দিকের অঙ্ক মিলছে না — পার্থক্য ${difference}।`,

  // --- the running summary at the foot of the form ---
  productionNoDue: "কাঁচামালের খরচ উৎপাদিত পণ্যে চলে যাবে — কোনো বকেয়া তৈরি হবে না।",
  adjustmentNoDue: "স্টকের কমবেশি সমন্বয় খাতে যাবে — কোনো বকেয়া তৈরি হবে না।",
  bothSidesMustMatch: "দুই দিক সমান হলেই এন্ট্রি সংরক্ষণ হবে।",
  serverRecomputes: "উপরের অঙ্কগুলো শুধু দেখানোর জন্য — সংরক্ষণের সময় সার্ভার নিজে হিসাব করে নেবে।",

  /* --- বলে বা ছবি তুলে এন্ট্রি ---
     Only the chrome. What the parser *matches on* stays Bengali in both
     locales, because the shopkeeper still speaks Bengali whichever language
     the buttons are in. */
  voiceTitle: "বলে বা ছবি তুলে এন্ট্রি",
  voiceOpen: "চালু করুন",
  voiceStart: "বলুন",
  voiceStop: "থামান",
  scanMemo: "মেমো স্ক্যান",
  comingSoon: "শীঘ্রই",
  voiceUnavailable: "এই ব্রাউজারে ভয়েস কাজ করছে না — নিচে লিখেও দিতে পারেন।",
  whatYouSaid: "যা বলেছেন",
  voiceExample:
    "যেমন: মায়ের দোয়া ট্রেডার্সকে ৫০০ কেজি পেপার বিক্রি করেছি, মেমো ১২৫, মোট ৮০ হাজার টাকা, ৫০ হাজার টাকা পেয়েছি",
  voicePlaceholder: "বাংলা বা বাংলিশে স্বাভাবিকভাবে লিখুন…",
  voiceParse: "বুঝে নিন",
  voiceApply: "ফর্মে বসান",
  voiceNotUnderstood: "বোঝা যায়নি",
  voiceReviewNotice: "ফর্মে বসানোর পর নিজে দেখে তারপর সংরক্ষণ করুন — এটি নিজে থেকে সংরক্ষণ করবে না।",
} as const;

/**
 * Settings — company profile, wallets, categories, units and recipes.
 */
export const settings = {
  hint: "কোম্পানির তথ্য, পেমেন্ট মাধ্যম, একক ও খাত",
  readOnlyNotice: "সেটিংস দেখতে পারছেন, কিন্তু পরিবর্তন করতে অ্যাডমিন অনুমতি লাগবে।",

  companyProfile: "কোম্পানির তথ্য",
  policyTitle: "কোম্পানির নিয়ম",
  largeAmount: "বড় অঙ্কের সীমা (৳)",
  largeAmountHint: "এর বেশি হলে একবার জিজ্ঞেস করা হবে। ০ দিলে বন্ধ",
  largeMultiple: "সাধারণের কত গুণ",
  largeMultipleHint: "এই পক্ষের চলতি গড়ের এত গুণ ছাড়ালে জিজ্ঞেস করা হবে। ০ দিলে বন্ধ",
  confirmEveryEntry: "প্রতিবার নিশ্চিত করুন",
  confirmEveryEntryLabel: "সংরক্ষণের আগে সবসময় জিজ্ঞেস করুন",
  confirmEveryEntryHint: "প্রতিটি এন্ট্রিতে একটি বাড়তি ধাপ যোগ হবে",
  policySaved: "নিয়ম সংরক্ষণ করা হয়েছে",
  policyHint: "কখন হিসাব বন্ধ হবে, আর কত দিন পর বকেয়া নিয়ে চিন্তা করতে হবে",
  lockedBefore: "এই তারিখের আগে হিসাব বন্ধ",
  lockedBeforeHint: "খালি রাখলে কোনো তারিখ বন্ধ থাকবে না",
  lockPriorMonths: "মাস শেষে বন্ধ",
  lockPriorMonthsLabel: "চলতি মাসের আগের সব তারিখ বন্ধ রাখুন",
  lockPriorMonthsHint: "চালু করলে গত মাসের এন্ট্রি দিতে অ্যাডমিনের PIN লাগবে",
  creditPeriodDays: "বাকির মেয়াদ (দিন)",
  creditPeriodHint: "এত দিন পর থেকে বকেয়া দেরি ধরা হবে",
  slowPayerDays: "ধীর গ্রাহক (দিন)",
  riskyDays: "ঝুঁকিপূর্ণ (দিন)",
  activityHint: "কত দিন চুপ থাকলে কাস্টমারকে নিয়ে চিন্তা করতে হবে",
  doubtfulDays: "সন্দেহজনক (দিন)",
  doubtfulDaysHint: "এত দিন অর্ডার না এলে হলুদ",
  criticalDays: "ঝুঁকিতে (দিন)",
  criticalDaysHint: "এত দিন অর্ডার না এলে লাল",
  recentDays: "সাম্প্রতিক সময় (দিন)",
  recentDaysHint: "এই কদিনের কেনাকাটা \"এখনকার\" ধরা হবে",
  baselineDays: "তুলনার সময় (দিন)",
  baselineDaysHint: "এত দিনের হিসাব দিয়ে আগের গড় বের হবে",
  volumeDropPercent: "কেনাকাটা কমার হার (%)",
  volumeDropHint: "নিজের গড় থেকে এত শতাংশ কমলে হলুদ। ০ দিলে বন্ধ",
  companySaved: "কোম্পানির তথ্য সংরক্ষিত হয়েছে",
  companyName: "কোম্পানির নাম",
  companyNameHint: "রিপোর্ট ও প্রিন্টে এই নামটি দেখাবে",
  bengaliName: "বাংলা নাম",
  businessType: "ব্যবসার ধরন",
  fiscalYearMonth: "অর্থবছর শুরুর মাস",
  fiscalYearHint: "বাংলাদেশে অর্থবছর সাধারণত জুলাই থেকে শুরু হয়",
  saving: "সংরক্ষণ হচ্ছে…",
  adding: "যোগ হচ্ছে…",

  walletsBalanceNote: "ব্যালেন্স খাতা থেকে আসে, হাতে বদলানো যায় না",
  nameColumn: "নাম",
  kindColumn: "ধরন",
  openingColumn: "প্রারম্ভিক",
  currentBalanceColumn: "বর্তমান ব্যালেন্স",
  isDefault: "ডিফল্ট",
  disabled: "বন্ধ",
  defaultMethod: "ডিফল্ট মাধ্যম",
  addWallet: "পেমেন্ট মাধ্যম যোগ করুন",
  walletAdded: "পেমেন্ট মাধ্যম যোগ হয়েছে",
  walletNamePlaceholder: "ইসলামী ব্যাংক",
  bankName: "ব্যাংকের নাম",
  accountNumber: "অ্যাকাউন্ট নম্বর",
  provider: "সেবাদাতা",
  walletOpeningHint: "এখন এই মাধ্যমে যত টাকা আছে। খাতায় প্রারম্ভিক ব্যালেন্স হিসেবে বসবে।",

  categories: "আয়-ব্যয়ের খাত",
  categoryColumn: "খাত",
  systemCategory: "সিস্টেম খাত",
  addCategory: "খাত যোগ করুন",
  categoryAdded: "খাত যোগ হয়েছে",
  incomeOrExpense: "আয় না ব্যয়",
  categoryName: "খাতের নাম",
  categoryNamePlaceholder: "গুদাম ভাড়া",
  categoryHint: "নতুন এন্ট্রিতে খাতের তালিকায় দেখাবে",

  addUnit: "একক যোগ করুন",
  unitAdded: "একক যোগ হয়েছে",
  unitNamePlaceholder: "কার্টন",
  unitAbbreviation: "সংক্ষিপ্ত রূপ",
  abbreviationColumn: "সংক্ষিপ্ত",
  productsColumn: "পণ্য",
  decimalPlaces: "দশমিক ঘর",
  decimalHint: "পিস গুনতে ০, কেজিতে ৩",
  usedInProducts: (count: string) => `${count} টি পণ্যে ব্যবহৃত`,

  productCategories: "পণ্যের ক্যাটাগরি",
  addProductCategory: "পণ্যের ক্যাটাগরি যোগ করুন",
  productCategoryAdded: "ক্যাটাগরি যোগ হয়েছে",
  productCategoryPlaceholder: "কাগজ",

  recipesHint: "উৎপাদন এন্ট্রিতে কাঁচামাল নিজে থেকেই বসাতে",
  noRecipes:
    "কোনো রেসিপি নেই। রেসিপি ছাড়াও উৎপাদন এন্ট্রি করা যায় — এটি শুধু টাইপ করা কমায়।",
  addRecipe: "রেসিপি যোগ করুন",
  recipeSaved: "রেসিপি সংরক্ষিত হয়েছে",
  choosePrompt: "— নির্বাচন করুন —",
  recipeNameLabel: (recipe: string) => `${recipe} নাম`,
  recipeNameHint: "খালি রাখলে উৎপাদিত পণ্যের নামেই চিনবেন",
  recipeInputsHint: "এক ব্যাচে যত লাগে — দাম নয়, শুধু পরিমাণ",
  removeInput: (index: string) => `কাঁচামাল ${index} মুছুন`,
  yieldHint: "৫০০ কেজি থেকে ৪৫০ কেজি পেলে ৯০",

  confirmDisableWallet: (name: string) => `${name} বন্ধ করবেন? নতুন এন্ট্রিতে আর দেখাবে না।`,
  confirmDisableCategory: (name: string) =>
    `${name} বন্ধ করবেন? তালিকা থেকে সরে যাবে, হিসাব থাকবে।`,

  invalidInput: "তথ্য সঠিক নয়",
  duplicateNameOrAbbreviation: "এই নামে বা সংক্ষিপ্ত রূপে একটি এন্ট্রি আগে থেকেই আছে",
} as const;

/**
 * The users screen: who can do what, and who did what.
 */
export const users = {
  hint: "কে কী করতে পারবে, আর কে কী করেছে",
  activeUsers: "সক্রিয় ব্যবহারকারী",
  people: "জন",
  recentActivity: "সাম্প্রতিক কার্যক্রম",
  countSuffix: "টি",
  needsAdmin: "পরিবর্তন করতে অ্যাডমিন অনুমতি লাগবে",
  roleColumn: "ভূমিকা",
  entriesColumn: "এন্ট্রি",
  joinedColumn: "যোগ হয়েছেন",
  you: "আপনি",
  removed: "সরানো হয়েছে",
  invitedBy: (name: string) => `যোগ করেছেন ${name}`,
  entryCount: (count: string) => `${count} টি এন্ট্রি`,
  whatRolesCanDo: "ভূমিকা কী কী করতে পারে",
  lastThirty: "শেষ ৩০টি",
  noActivity: "এখনো কোনো কার্যক্রম নেই",
  system: "সিস্টেম",

  /** Spec §2, in the words the person choosing has to weigh. */
  roleSummaryAdmin: "সবকিছু — সেটিংস, ব্যবহারকারী ও লাভের রিপোর্টসহ",
  roleSummaryManager: "এন্ট্রি, বাতিল, কাস্টমার, পণ্য ও রিপোর্ট — সেটিংস ছাড়া",
  roleSummaryOperator: "শুধু এন্ট্রি করতে পারেন, লাভ-ক্ষতি দেখতে পারেন না",

  addMember: "ব্যবহারকারী যোগ করুন",
  added: "যোগ করা হয়েছে",
  phoneHint: "যে নম্বর দিয়ে তিনি HishabAI-এ রেজিস্টার করেছেন",
  adding: "যোগ হচ্ছে…",
  confirmRemove: (name: string) => `${name} কে সরাবেন? তাঁর করা এন্ট্রিগুলো থেকে যাবে।`,
  remove: "সরান",
  actionFailed: "কাজটি করা যায়নি। আবার চেষ্টা করুন।",
} as const;

/**
 * Sign-in, registration and password reset.
 *
 * The only screens someone can reach without a session, so they are also the
 * only place the locale switcher is not available — whatever is in the cookie
 * from last time is what they get.
 */
export const auth = {
  loginTitle: "লগইন করুন",
  loginSubtitle: "আপনার ব্যবসার হিসাব দেখতে লগইন করুন",
  email: "ইমেইল",
  password: "পাসওয়ার্ড",
  login: "লগইন",
  forgotPassword: "পাসওয়ার্ড ভুলে গেছেন?",
  newAccount: "নতুন অ্যাকাউন্ট",

  registerTitle: "নতুন অ্যাকাউন্ট খুলুন",
  registerSubtitle: "কয়েক মিনিটেই ব্যবসার হিসাব শুরু করুন",
  yourName: "আপনার নাম",
  namePlaceholder: "মোঃ রফিকুল ইসলাম",
  passwordHint: "অন্তত ৮ অক্ষর",
  createAccount: "অ্যাকাউন্ট তৈরি করুন",
  haveAccount: "অ্যাকাউন্ট আছে?",

  resetTitle: "পাসওয়ার্ড রিসেট",
  resetSubtitle: "ইমেইল দিন, রিসেট লিংক পাঠানো হবে",
  sendResetLink: "রিসেট লিংক পাঠান",
  backToLogin: "লগইনে ফিরে যান",

  invalidEmail: "ইমেইল ঠিকানাটি সঠিক নয়",
  passwordTooShort: "পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে",
  nameRequired: "আপনার নাম দিন",
  invalidInput: "তথ্য সঠিক নয়",
  wrongCredentials: "ইমেইল বা পাসওয়ার্ড মিলছে না",
  confirmByEmail: "ইমেইলে পাঠানো লিংকে ক্লিক করে অ্যাকাউন্ট নিশ্চিত করুন।",
  // Deliberately non-committal: saying "no such account" would confirm which
  // addresses are registered.
  newPasswordTitle: "নতুন পাসওয়ার্ড দিন",
  newPasswordSubtitle: "এই লিংকটি একবারই কাজ করে",
  newPassword: "নতুন পাসওয়ার্ড",
  confirmPassword: "আবার লিখুন",
  savePassword: "পাসওয়ার্ড সংরক্ষণ করুন",
  passwordsDoNotMatch: "দুটি পাসওয়ার্ড এক হয়নি।",
  resetLinkExpired: "লিংকটির মেয়াদ শেষ। আবার অনুরোধ করুন।",
  resetFailed: "পাসওয়ার্ড বদলানো যায়নি। আবার চেষ্টা করুন।",
  signUpFailed: "অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।",
  linkProblem: "লিংকটি কাজ করেনি। আবার অনুরোধ করুন।",
  resetSent: "যদি অ্যাকাউন্ট থেকে থাকে, রিসেট লিংক পাঠানো হয়েছে।",
} as const;

/**
 * Master data: the customer, vendor and product lists and their detail pages.
 *
 * Customers and vendors share one screen shape and one service, but not one
 * vocabulary — a customer's balance is বকেয়া and a vendor's is পাওনা, and
 * showing the wrong one is the kind of mistake a shopkeeper notices
 * immediately. The two sets are kept apart here rather than parametrised.
 */
export const masterData = {
  customersHint: "কার কাছে কত বকেয়া, এক নজরে",
  vendorsHint: "কার পাওনা কত, এক নজরে",
  customerCount: "কাস্টমার সংখ্যা",
  vendorCount: "ভেন্ডর সংখ্যা",
  people: "জন",
  withDues: "বকেয়া আছে যাদের",
  withPayables: "পাওনা আছে যাদের",
  nameOrPhone: "নাম বা মোবাইল নম্বর",
  onlyWithDues: "শুধু যাদের বকেয়া আছে",
  onlyWithPayables: "শুধু যাদের পাওনা আছে",
  customerCountTitle: (count: string) => `${count} জন কাস্টমার`,
  vendorCountTitle: (count: string) => `${count} জন ভেন্ডর`,
  noPayables: "কারও পাওনা নেই",
  addCustomerHint: "উপরে কাস্টমার যোগ করুন, বা বিক্রয় এন্ট্রির মধ্যেই যোগ করে নিন",
  addVendorHint: "উপরে ভেন্ডর যোগ করুন, বা ক্রয় এন্ট্রির মধ্যেই যোগ করে নিন",
  addProductHint: "উপরে পণ্য যোগ করুন, বা ক্রয় এন্ট্রির মধ্যেই যোগ করে নিন",
  totalSalesColumn: "মোট বিক্রয়",
  totalPurchasesColumn: "মোট ক্রয়",
  totalPaidColumn: "মোট পরিশোধ",
  lastEntryColumn: "শেষ লেনদেন",
  noPhone: "মোবাইল নম্বর নেই",
  payable: "পাওনা",
  noDue: "বকেয়া নেই",
  noPayable: "পাওনা নেই",

  stockSelfUpdates: "স্টক প্রতিটি এন্ট্রির সাথে নিজে থেকেই আপডেট হয়",
  productCountLabel: "পণ্যের সংখ্যা",
  countSuffix: "টি",
  outOfStock: "স্টক শেষ",
  nameOrCode: "পণ্যের নাম বা কোড",
  productKindLabel: "পণ্যের ধরন",
  all: "সব",
  onlyLowStock: "শুধু যেগুলোর স্টক সর্বনিম্নে নেমেছে",
  productCountTitle: (count: string) => `${count} টি পণ্য`,
  kindColumn: "ধরন",
  stockColumn: "স্টক",
  stockValueColumn: "স্টক ভ্যালু",
  empty: "শেষ",
  average: "গড়",

  // --- party detail ---
  printStatement: (statement: string) => `${statement} প্রিন্ট`,
  payableStatement: "পাওনা বিবরণী",
  payableStatementPrint: "পাওনা বিবরণী প্রিন্ট",
  totalBilled: "এই কাস্টমারের কাছে মোট বিল",
  totalBought: "এই ভেন্ডরের কাছ থেকে মোট কেনা",
  totalReceivedHint: "যত টাকা পাওয়া গেছে",
  totalPaidHint: "যত টাকা দেওয়া হয়েছে",
  stillOwed: "এখনো বাকি",
  stillToPay: "এখনো দিতে হবে",
  allSettled: "সব পরিশোধ হয়েছে",
  statementNote: "বিল ও পরিশোধ আলাদা লাইনে, নিচে চলতি ব্যালেন্স",
  firstSaleHint: "এই কাস্টমারের প্রথম বিক্রয় এন্ট্রি করলে বিবরণী তৈরি হবে",
  firstPurchaseHint: "এই ভেন্ডরের প্রথম ক্রয় এন্ট্রি করলে বিবরণী তৈরি হবে",
  billColumn: "বিল",
  balanceColumn: "ব্যালেন্স",
  currentDue: "বর্তমান বকেয়া",
  currentPayable: "বর্তমান পাওনা",
  statementFooter: "HishabAI থেকে তৈরি করা বিবরণী।",

  // --- product detail ---
  unitIs: (unit: string) => `একক ${unit}`,
  codeIs: (code: string) => ` · কোড ${code}`,
  currentStock: "বর্তমান স্টক",
  weightedAverage: "ওজনভিত্তিক গড়",
  atThisLevel: "এই স্তরে নেমে গেছে",
  warnBelow: "এর নিচে নামলে সতর্কতা",
  notSet: "নির্ধারিত নয়",
  stockMovements: "স্টকের গতিবিধি",
  stockMovementsNote: "প্রতিটি লাইনে সেই সময়ের ব্যালেন্স ও গড় মূল্য",
  noMovements: "এখনো কোনো স্টক গতিবিধি নেই",
  noMovementsHint: "ক্রয় বা বিক্রয় এন্ট্রি করলেই এখানে ইতিহাস জমা হবে",
  rateColumn: "দর",

  // --- search ---
  searchHint: "কাস্টমার, ভেন্ডর, পণ্য, ভাউচার ও মেমো — এক জায়গায়",
  searchPlaceholder: "নাম, নম্বর, ভাউচার বা অঙ্ক",
  searchPrompt: "কী খুঁজছেন?",
  searchPromptHint: "কাস্টমারের নাম, মোবাইল নম্বর, পণ্যের নাম, ভাউচার নম্বর বা টাকার অঙ্ক লিখুন",
  searchMiss: (query: string) => `"${query}" খুঁজে পাওয়া যায়নি`,
  searchMissHint: "বানান দেখে নিন, অথবা অন্য শব্দ দিয়ে চেষ্টা করুন",
  resultsSuffix: "টি ফলাফল",
  partiesHeading: "কাস্টমার ও ভেন্ডর",
  stockIs: (quantity: string) => `স্টক ${quantity}`,
  memoIs: (memoNo: string) => `মেমো ${memoNo}`,

  // --- the inline create panels, on নতুন এন্ট্রি and the list pages ---
  newCustomer: "নতুন কাস্টমার",
  newVendor: "নতুন ভেন্ডর",
  newProduct: "নতুন পণ্য",
  partyNamePlaceholder: "মায়ের দোয়া ট্রেডার্স",
  typeLabel: "ধরন",
  openingReceivableHint: "আগে থেকে যত টাকা বকেয়া আছে",
  openingPayableHint: "আগে থেকে যত টাকা পাওনা আছে",
  assignedTo: "দায়িত্বে যিনি",
  assignedToHint: "এই কাস্টমার চুপ হয়ে গেলে এই ব্যক্তিকে জানানো হবে",
  assignedToNobody: "— কেউ নয় —",
  creditLimitHint: "এর বেশি বাকি পড়লে বিক্রির সময় সতর্ক করা হবে — বিক্রি আটকাবে না",
  productNamePlaceholder: "অফসেট পেপার",
  unitHint: "কেজি, পিস, রোল — সেটিংস থেকে যোগ করা যায়",
  choosePrompt: "— নির্বাচন করুন —",
  nonePrompt: "— নেই —",
  categoryLabel: "ক্যাটাগরি",
  minStockHint: "এর নিচে নামলে বিজ্ঞপ্তি পাবেন",
  openingStock: "প্রারম্ভিক স্টক",
  openingStockHint: (unit: string) =>
    `আজ গুদামে যত ${unit} আছে — খাতায় প্রারম্ভিক স্টক হিসেবে বসবে`,
  openingStockRate: "প্রারম্ভিক স্টকের দর",
  openingStockRateHint: "খালি রাখলে ক্রয় মূল্য ধরা হবে",
} as const;

/**
 * The transaction list and the voucher view.
 */
export const transactions = {
  printReceipt: "রসিদ প্রিন্ট করুন",
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

/**
 * The scale words a compact figure ends in.
 *
 * `formatMoneyCompact` takes these rather than reading a locale itself — the
 * money module has no business knowing one exists.
 */
export const moneyScale = {
  crore: "কোটি",
  lakh: "লাখ",
  thousand: "হাজার",
} as const;

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
  skipToContent: "মূল অংশে যান",
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

/**
 * Why the engine refused an entry.
 *
 * The engine is pure and cannot reach a dictionary, so it names the rule and
 * hands the numbers over already formatted — the format is identical in both
 * locales, only the sentence around it changes — and the sentence is built
 * here. See `BlockedReason` in `../types`.
 */
export const blocked = {
  emptyTransaction: "এই এন্ট্রিতে কোনো অঙ্ক নেই।",
  unbalancedEntry: "হিসাব মেলেনি — ডেবিট ও ক্রেডিট সমান হয়নি। এন্ট্রিটি সংরক্ষণ করা হয়নি।",
  negativeJournalAmount: "হিসাবের অঙ্ক ঋণাত্মক হতে পারে না।",
  missingProduct: "পণ্যটি খুঁজে পাওয়া যায়নি।",
  missingFinancialAccount: "পেমেন্ট মাধ্যমটি খুঁজে পাওয়া যায়নি।",
  paymentExceedsTotal: (paid: string, total: string) =>
    `পেমেন্টের পরিমাণ মোট মূল্যের চেয়ে বেশি হতে পারে না — ${paid}, মোট ${total}।`,
  discountExceedsTotal: (discount: string, total: string) =>
    `ছাড় মোট মূল্যের চেয়ে বেশি হতে পারে না — ${discount}, মোট ${total}।`,
  productionCostUnpaid: (cost: string, paid: string) =>
    `লেবার ও অন্যান্য খরচের সমান পরিমাণ পেমেন্ট মাধ্যম থেকে দিতে হবে — খরচ ${cost}, দেওয়া হয়েছে ${paid}।`,
  wastageNotAnInput: (product: string) =>
    `${product} — অপচয়ের পণ্যটি এই উৎপাদনের কাঁচামালের তালিকায় নেই।`,
  wastageExceedsInputs: "অপচয়ের পরিমাণ ব্যবহৃত কাঁচামালের চেয়ে বেশি হতে পারে না।",
  negativeStock: (product: string, available: string, requested: string) =>
    `${product} — পর্যাপ্ত স্টক নেই। বর্তমান স্টক ${available}, চাওয়া হয়েছে ${requested}।`,
  duplicateMemo: (memoNo: string, voucher: string) =>
    `${memoNo} নম্বর চালান আগেই আছে — ${voucher}।`,
  duplicateMemoNumber: (memoNo: string) => `${memoNo} নম্বর চালান আগেই আছে।`,
  insufficientFunds: (wallet: string, available: string, requested: string) =>
    `${wallet} — এত টাকা নেই। বর্তমান ব্যালেন্স ${available}, দেওয়া হচ্ছে ${requested}।`,
  overCreditLimit: (party: string, limit: string, projected: string) =>
    `${party} — ক্রেডিট সীমা ${limit} ছাড়িয়ে যাচ্ছে। এই বিলের পর বকেয়া দাঁড়াবে ${projected}।`,
  riskyParty: (party: string) =>
    `${party} — অনেক দিনের পুরনো বকেয়া আছে, তাই নতুন বাকিতে বিক্রয় করা যাবে না।`,
  periodLocked: (date: string, lockedBefore: string) =>
    `${date} তারিখের হিসাব বন্ধ করা আছে। ${lockedBefore} বা তার পরের তারিখ দিন।`,
  negativeCapital: (available: string, requested: string) =>
    `ব্যবসার মূলধন ঋণাত্মক হয়ে যাবে। বর্তমান মূলধন ${available}, এই এন্ট্রিতে কমছে ${requested}।`,
} as const;

/**
 * The probable duplicate — spec R2.2. A question, not a refusal: the same
 * customer ordering the same thing twice in one day is an ordinary Tuesday.
 */
export const duplicate = {
  title: "একই রকম এন্ট্রি আগেই আছে",
  body: (voucher: string, time: string) =>
    `হুবহু একই এন্ট্রি আগেই সংরক্ষণ করা হয়েছে — ${voucher}, ${time}। তবুও সংরক্ষণ করবেন?`,
  viewExisting: "আগের এন্ট্রিটি দেখুন",
  saveAnyway: "তবুও সংরক্ষণ করুন",
} as const;

/**
 * The authorised override — spec R1.2.
 *
 * Deliberately plain about what is happening: an override is a decision the
 * shopkeeper is making on the record, not a dismissible warning, and the
 * wording says so.
 */
export const override = {
  blockedTitle: "এন্ট্রিটি সংরক্ষণ করা যায়নি",
  overrideTitle: "নিয়ম এড়িয়ে সংরক্ষণ করবেন?",
  explain: "অ্যাডমিন হিসেবে আপনি এটি সংরক্ষণ করতে পারেন। কাজটি হিসাবের খাতায় লেখা থাকবে।",
  pin: "ওভাররাইড PIN",
  pinHint: "যে PIN সেটিংসে সেট করেছেন",
  submit: "PIN দিয়ে সংরক্ষণ করুন",
  wrongPin: "PIN মেলেনি।",
  noPin: "ওভাররাইড PIN এখনো সেট করা হয়নি। সেটিংস থেকে সেট করুন।",
  notAdmin: "শুধু অ্যাডমিন এই বাধা এড়াতে পারেন।",
  notOverridable: "এই বাধাটি এড়ানো যায় না।",
  recorded: "নিয়ম এড়ানো হয়েছে — হিসাবের খাতায় লেখা হয়েছে।",
  recordedRule: (rule: string) => `নিয়ম এড়ানো হয়েছে — ${rule}`,
  setTitle: "ওভাররাইড PIN",
  setDescription:
    "স্টক না থাকা সত্ত্বেও বিক্রয়ের মতো এন্ট্রি সংরক্ষণ করতে এই PIN লাগবে। শুধু অ্যাডমিনের জন্য।",
  newPin: "নতুন PIN",
  confirmPin: "আবার লিখুন",
  pinRule: "৪ থেকে ১২টি সংখ্যা",
  mismatch: "দুটি PIN এক হয়নি।",
  isSet: "PIN সেট করা আছে",
  notSet: "PIN সেট করা নেই",
  savePin: "PIN সংরক্ষণ করুন",
  saved: "PIN সংরক্ষণ করা হয়েছে",
} as const;

/** Things the entry did anyway, and the shopkeeper should still know about. */
export const warned = {
  stockWentNegative: (product: string) =>
    `${product} — স্টক ঋণাত্মক হয়ে গেছে। ক্রয় এন্ট্রি বাদ পড়েছে কি না দেখুন।`,
  zeroCostReturn: (product: string) =>
    `${product} — গড় ক্রয়মূল্য শূন্য, তাই ফেরত পণ্যের কোনো মূল্য যোগ হয়নি।`,
  zeroCostSurplus: (product: string) =>
    `${product} — গড় ক্রয়মূল্য শূন্য, তাই বাড়তি স্টকের কোনো মূল্য ধরা হয়নি।`,
  overCreditLimit: (party: string, limit: string, projected: string) =>
    `${party} — ক্রেডিট সীমা ${limit} ছাড়িয়ে যাচ্ছে। এই বিলের পর বকেয়া দাঁড়াবে ${projected}।`,
} as const;

/**
 * What a zod schema says when a field is wrong — spec R4.5.
 *
 * The schemas live in `../schemas` at module scope, so they cannot hold a
 * resolved sentence: the first request the process served would freeze its
 * language into every later one. They carry these keys instead, and
 * `validationMessage` turns a key into a sentence in whichever language the
 * request is being served in — on the server *and* in the browser, from the
 * same schema, so the two can never disagree about what is wrong.
 */
export const validation = {
  addProduct: "অন্তত একটি পণ্য যোগ করুন",
  addMaterial: "কাঁচামাল যোগ করুন",
  addOneMaterial: "অন্তত একটি কাঁচামাল যোগ করুন",
  addOutput: "উৎপাদিত পণ্য যোগ করুন",
  choosePaymentMethod: "পেমেন্ট মাধ্যম নির্বাচন করুন",
  chooseOne: "নির্বাচন করুন",
  twoAccounts: "অন্তত দুটি হিসাব লাগবে",
  nameRequired: "নাম দিন",
  companyNameRequired: "কোম্পানির নাম দিন",
  productNameRequired: "পণ্যের নাম দিন",
  categoryNameRequired: "খাতের নাম দিন",
  unitNameRequired: "এককের নাম দিন",
  abbreviationRequired: "সংক্ষিপ্ত রূপ দিন",
  dateInvalid: "তারিখ সঠিক নয়",
  numberInvalid: "সংখ্যাটি সঠিক নয়",
  mustBePositive: "শূন্যের চেয়ে বড় সংখ্যা দিন",
  notNegative: "ঋণাত্মক হতে পারে না",
  phoneInvalid: "মোবাইল নম্বর সঠিক নয়",
  pinInvalid: "PIN সঠিক নয়",
  required: "এই ঘরটি পূরণ করুন",
} as const;

/**
 * The one confirmation gate — spec R4.2.
 *
 * Every "are you sure?" in the app renders through a single dialog, so the
 * wording, the buttons and the way it is dismissed are decided once.
 */
export const confirm = {
  unusualTitle: "অঙ্কটা কি ঠিক আছে?",
  unusualAbsolute: (total: string) =>
    `এই এন্ট্রির পরিমাণ ${total} — অনেক বড়। একবার দেখে নিন।`,
  unusualMultiple: (total: string, usual: string) =>
    `এই এন্ট্রির পরিমাণ ${total}, অথচ এই পক্ষের সাধারণ এন্ট্রি ${usual}। একবার দেখে নিন।`,
  yesItIsRight: "হ্যাঁ, ঠিক আছে",
  finalTitle: "এন্ট্রিটি সংরক্ষণ করবেন?",
  finalBody: (total: string) => `সর্বমোট ${total}। সংরক্ষণের পর বাতিল করা যাবে, মুছে ফেলা যাবে না।`,
} as const;

/**
 * কাস্টমারের অবস্থা — spec R5.1, R5.3, R5.4, R5.5 and R5.6.
 *
 * Every one of these is derived on read, so the copy never claims a date it
 * cannot prove: "১২ দিন চুপ" is counted from the journal this morning, not
 * read out of a column somebody wrote last week.
 */
export const activity = {
  title: "কাস্টমারের অবস্থা",
  hint: "কে নিয়মিত, কে চুপ, আর কার বকেয়া পুরনো হচ্ছে",
  status: {
    normal: "স্বাভাবিক",
    doubtful: "সন্দেহজনক",
    critical: "ঝুঁকিতে",
  } as Record<ActivityStatus, string>,
  /* The receivable bands. Same three words the credit rules use. */
  band: {
    healthy: "ভালো",
    slow: "ধীর",
    risky: "ঝুঁকিপূর্ণ",
  },
  dailyTitle: "আজকের সতর্কতা",
  dailyHint: (date: string) => `${date} তারিখের হিসাবে`,
  likelyLost: "হারানোর আশঙ্কা",
  likelyLostBody: (names: string) => `অনেক দিন অর্ডার নেই — ${names}`,
  enteredDoubtful: "আজ সন্দেহজনক হয়েছে",
  enteredCritical: "আজ ঝুঁকিতে পড়েছে",
  agedToday: "আজ বকেয়ার সীমা পেরিয়েছে",
  agedTodayBody: (name: string, days: string) => `${name} — ${days} দিন পার`,
  volumeDrops: "কেনাকাটা কমেছে",
  volumeDropBody: (name: string, now: string, before: string) =>
    `${name} — এখন ${now}, আগে ${before}`,
  volumeDropBadge: "কম কিনছে",
  followUps: "ফলো-আপ কল",
  followUpLine: (name: string) => `${name} কে ফলো-আপ কল দিন`,
  followUpHint: "হলুদ বা লাল হলেই তালিকায় আসে, কল করা পর্যন্ত থাকে",
  noAlerts: "আজ নতুন কোনো সতর্কতা নেই",
  allHealthy: "সব কাস্টমার নিয়মিত আছে",
  reactivation: "ফিরিয়ে আনার তালিকা",
  reactivationHint: "যারা নিয়মিত কিনত, তারপর থেমে গেছে",
  noReactivation: "নিয়মিত কেনার পর থেমে গেছে — এমন কেউ নেই",
  statusColumn: "অবস্থা",
  lastOrder: "শেষ অর্ডার",
  neverOrdered: "কখনো অর্ডার করেনি",
  daysSilent: (days: string) => `${days} দিন চুপ`,
  orderCount: "অর্ডার",
  orderCountValue: (count: string) => `${count} বার`,
  recentVolume: "সাম্প্রতিক কেনাকাটা",
  baselineVolume: "আগের গড়",
  overdueDays: (days: string) => `${days} দিন পার`,
  call: "কল করুন",
  noPhone: "ফোন নম্বর নেই",
  onlyReactivation: "শুধু ফিরিয়ে আনার তালিকা",
  customerCount: (count: string) => `${count} জন কাস্টমার`,
} as const;

/**
 * হোয়াটসঅ্যাপ লগ — spec R4.6 asks for delivery attempts and failures to be
 * logged. The log is only useful if somebody can read it, and the question it
 * has to answer is "why did this customer never hear from us?".
 */
export const delivery = {
  title: "হোয়াটসঅ্যাপ লগ",
  hint: "কোন বার্তা কাকে গেছে, আর কোনটা কেন যায়নি",
  inertNotice:
    "হোয়াটসঅ্যাপ এখনো চালু হয়নি — বার্তা তৈরি ও সংরক্ষণ হচ্ছে, কিন্তু পাঠানো হচ্ছে না।",
  status: {
    pending: "অপেক্ষায়",
    sent: "পাঠানো হয়েছে",
    failed: "ব্যর্থ",
    skipped: "বাদ পড়েছে",
  } as Record<DeliveryStatus, string>,
  template: {
    paymentReceived: "টাকা পাওয়া গেছে",
    entryRecorded: "এন্ট্রি হয়েছে",
    dailySummary: "দিনের হিসাব",
    customerAtRisk: "কাস্টমার ঝুঁকিতে",
  },
  whenColumn: "কখন",
  templateColumn: "বার্তা",
  recipientColumn: "প্রাপক",
  messageColumn: "যা লেখা ছিল",
  statusColumn: "অবস্থা",
  attemptsColumn: "চেষ্টা",
  attemptsValue: (count: string) => `${count} বার`,
  noRecipient: "নম্বর নেই",
  empty: "এখনো কোনো বার্তা তৈরি হয়নি",
  emptyHint: "কাস্টমারের নামে এন্ট্রি হলে এখানে দেখা যাবে",
} as const;

export const bn = {
  nav,
  navGroup,
  actions,
  transactionType,
  transactionTypeHint,
  fields,
  dashboard,
  activity,
  delivery,
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
  blocked,
  confirm,
  warned,
  validation,
  duplicate,
  override,
  shell,
  auth,
  onboarding,
  entry,
  users,
  settings,
  masterData,
  transactions,
  reports,
  months,
  monthsShort,
  moneyScale,
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
