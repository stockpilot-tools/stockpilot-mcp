import type {
  AssetClass,
  CanonicalAccount,
  CanonicalHolding,
  CanonicalQuote,
  CanonicalTransaction,
  TransactionType,
} from "../types/index.js";
import type {
  SnapTradeRawAccount,
  SnapTradeRawHolding,
  SnapTradeRawQuote,
  SnapTradeRawTransaction,
} from "../types/provider-raw.js";

function normalizeMoney(amount: number, currency: string) {
  return {
    amount,
    currency: currency.trim().toUpperCase(),
  };
}

function inferAccountType(value?: string): CanonicalAccount["type"] {
  switch (value?.toLowerCase()) {
    case "cash":
      return "checking";
    case "margin":
    case "brokerage":
      return "brokerage";
    case "ira":
      return "ira";
    case "roth_ira":
      return "roth_ira";
    default:
      return "brokerage";
  }
}

function extractCurrencyCode(value?: string | { code?: string }): string {
  if (typeof value === "string") {
    return value.toUpperCase();
  }

  return value?.code?.toUpperCase() ?? "USD";
}

function extractSecurityTypeCode(value?: string | { code?: string }): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.code;
}

function inferAssetClass(value?: string): AssetClass {
  switch (value?.toLowerCase()) {
    case "etf":
      return "etf";
    case "stock":
    case "equity":
      return "equity";
    case "option":
      return "option";
    case "mutual_fund":
      return "fund";
    default:
      return "other";
  }
}

function inferTransactionType(value: string): TransactionType {
  switch (value.toLowerCase()) {
    case "buy":
      return "buy";
    case "sell":
      return "sell";
    case "deposit":
      return "deposit";
    case "withdrawal":
      return "withdrawal";
    case "dividend":
      return "dividend";
    case "interest":
      return "interest";
    case "fee":
      return "fee";
    case "transfer":
      return "transfer";
    default:
      return "other";
  }
}

export function normalizeSnapTradeAccount(raw: SnapTradeRawAccount): CanonicalAccount {
  return {
    id: `snaptrade:${raw.id}`,
    provider: "snaptrade",
    providerAccountId: raw.id,
    name: raw.name,
    type: inferAccountType(raw.brokerageAuthorizationType),
    currency: raw.balance?.total?.currency?.toUpperCase() ?? "USD",
    institutionName: raw.institutionName,
    mask: raw.number?.slice(-4),
    balance: raw.balance?.total
      ? normalizeMoney(raw.balance.total.amount, raw.balance.total.currency)
      : undefined,
    availableBalance: raw.balance?.available
      ? normalizeMoney(raw.balance.available.amount, raw.balance.available.currency)
      : undefined,
    cash: raw.cash ? normalizeMoney(raw.cash.amount, raw.cash.currency) : undefined,
    metadata: {
      accountNumber: raw.number,
      accountCategory: raw.account_category,
      brokerageAuthorizationType: raw.brokerageAuthorizationType,
      rawType: raw.raw_type,
    },
  };
}

export function normalizeSnapTradeHolding(raw: SnapTradeRawHolding): CanonicalHolding {
  const currency = extractCurrencyCode(raw.symbol.currency);

  return {
    id: `snaptrade:${raw.accountId}:${raw.symbol.symbol}`,
    provider: "snaptrade",
    accountId: `snaptrade:${raw.accountId}`,
    symbol: raw.symbol.symbol.toUpperCase(),
    name: raw.symbol.description,
    assetClass: inferAssetClass(extractSecurityTypeCode(raw.symbol.type)),
    quantity: raw.units,
    currency,
    price: raw.price !== undefined ? normalizeMoney(raw.price, currency) : undefined,
    marketValue:
      raw.marketValue !== undefined ? normalizeMoney(raw.marketValue, currency) : undefined,
    averagePurchasePrice:
      raw.averagePurchasePrice !== undefined
        ? normalizeMoney(raw.averagePurchasePrice, currency)
        : undefined,
    costBasis:
      raw.averagePurchasePrice !== undefined && raw.units > 0
        ? normalizeMoney(raw.averagePurchasePrice * raw.units, currency)
        : undefined,
  };
}

export function normalizeSnapTradeTransaction(
  raw: SnapTradeRawTransaction,
): CanonicalTransaction {
  return {
    id: `snaptrade:${raw.id}`,
    provider: "snaptrade",
    accountId: `snaptrade:${raw.accountId}`,
    type: inferTransactionType(raw.type),
    status: raw.status as CanonicalTransaction["status"],
    symbol: raw.symbol?.symbol?.toUpperCase(),
    description: raw.description ?? raw.type,
    quantity: raw.units,
    price:
      raw.price !== undefined ? normalizeMoney(raw.price, raw.currency.toUpperCase()) : undefined,
    amount: normalizeMoney(raw.amount, raw.currency),
    fee: raw.fee !== undefined ? normalizeMoney(raw.fee, raw.currency) : undefined,
    occurredAt: new Date(raw.tradeDate).toISOString(),
    settledAt: raw.settlementDate ? new Date(raw.settlementDate).toISOString() : undefined,
    metadata: {
      rawType: raw.type,
    },
  };
}

export function normalizeSnapTradeQuote(raw: SnapTradeRawQuote): CanonicalQuote {
  return {
    symbol: raw.symbol.toUpperCase(),
    provider: "snaptrade",
    price: normalizeMoney(raw.lastTradePrice, raw.currency),
    asOf: new Date(raw.timestamp).toISOString(),
    change24h: raw.dailyChange,
    changePercent24h: raw.dailyChangePercent,
  };
}
