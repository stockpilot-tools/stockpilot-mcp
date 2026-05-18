export type ProviderId = "snaptrade" | (string & {});

export type AssetClass =
  | "cash"
  | "crypto"
  | "equity"
  | "etf"
  | "fixed_income"
  | "fund"
  | "option"
  | "other";

export type AccountType =
  | "brokerage"
  | "checking"
  | "credit"
  | "crypto_wallet"
  | "exchange"
  | "ira"
  | "roth_ira"
  | "savings"
  | "other";

export type TransactionType =
  | "buy"
  | "sell"
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "interest"
  | "fee"
  | "transfer"
  | "other";

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface CanonicalAccount {
  id: string;
  provider: ProviderId;
  providerAccountId: string;
  name: string;
  type: AccountType;
  currency: string;
  institutionName?: string;
  mask?: string;
  balance?: MoneyAmount;
  availableBalance?: MoneyAmount;
  cash?: MoneyAmount;
  metadata?: Record<string, unknown>;
}

export interface CanonicalHolding {
  id: string;
  provider: ProviderId;
  accountId: string;
  symbol: string;
  name?: string;
  assetClass: AssetClass;
  quantity: number;
  currency: string;
  price?: MoneyAmount;
  marketValue?: MoneyAmount;
  averagePurchasePrice?: MoneyAmount;
  costBasis?: MoneyAmount;
  metadata?: Record<string, unknown>;
}

export interface CanonicalTransaction {
  id: string;
  provider: ProviderId;
  accountId: string;
  type: TransactionType;
  status?: "pending" | "posted" | "failed" | "cancelled";
  symbol?: string;
  description: string;
  quantity?: number;
  price?: MoneyAmount;
  amount: MoneyAmount;
  fee?: MoneyAmount;
  occurredAt: string;
  settledAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalQuote {
  symbol: string;
  provider: ProviderId;
  price: MoneyAmount;
  asOf: string;
  change24h?: number;
  changePercent24h?: number;
  metadata?: Record<string, unknown>;
}

export interface SyncResult<T> {
  items: T[];
  nextCursor?: string;
  raw?: unknown;
}
