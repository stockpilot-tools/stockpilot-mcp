export interface SnapTradeRawAccount {
  id: string;
  name: string;
  number?: string;
  institutionName?: string;
  brokerageAuthorizationType?: string;
  raw_type?: string | null;
  account_category?: string | null;
  balance?: {
    total?: {
      amount: number;
      currency: string;
    };
    available?: {
      amount: number;
      currency: string;
    };
  };
  cash?: {
    amount: number;
    currency: string;
  };
}

export interface SnapTradeRawBalance {
  currency: { code?: string };
  cash: number;
  buying_power?: number;
}

export interface SnapTradeRawHolding {
  accountId: string;
  symbol: {
    symbol: string;
    description?: string;
    currency?: string | { code?: string };
    type?: string | { code?: string };
  };
  units: number;
  price?: number;
  marketValue?: number;
  averagePurchasePrice?: number;
}

export interface SnapTradeRawTransaction {
  id: string;
  accountId: string;
  type: string;
  status?: string;
  description?: string;
  symbol?: {
    symbol: string;
  };
  units?: number;
  price?: number;
  amount: number;
  currency: string;
  fee?: number;
  tradeDate: string;
  settlementDate?: string;
}

export interface SnapTradeRawQuote {
  symbol: string;
  lastTradePrice: number;
  currency: string;
  timestamp: string;
  dailyChange?: number;
  dailyChangePercent?: number;
}
