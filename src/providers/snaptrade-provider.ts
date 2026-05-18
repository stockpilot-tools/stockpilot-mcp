import type { SnapTradeProviderConfig } from "../config/index.js";
import {
  normalizeSnapTradeAccount,
  normalizeSnapTradeHolding,
  normalizeSnapTradeQuote,
} from "../normalizers/index.js";
import type {
  CanonicalAccount,
  CanonicalHolding,
  CanonicalQuote,
  SyncResult,
} from "../types/index.js";
import type {
  SnapTradeRawAccount,
  SnapTradeRawBalance,
  SnapTradeRawHolding,
  SnapTradeRawQuote,
} from "../types/provider-raw.js";
import { BaseProvider, type ProviderContext, type ProviderHealth } from "./base-provider.js";
import { requestJson } from "./http.js";
import { createSnapTradeSignature } from "./snaptrade-auth.js";

interface SnapTradeAccountApiResponse {
  id: string;
  name: string | null;
  number: string;
  institution_name: string;
  balance?: {
    total?: {
      amount?: number;
      currency?: string;
    } | null;
  } | null;
  raw_type?: string | null;
  account_category?: string | null;
}

interface SnapTradePositionApiResponse {
  symbol?: {
    symbol?: {
      symbol?: string;
      description?: string | null;
      currency?: { code?: string };
      type?: { code?: string };
    };
  };
  units?: number | null;
  price?: number | null;
  market_value?: number | null;
  average_purchase_price?: number | null;
}

interface SnapTradeQuoteApiResponse {
  symbol?: {
    symbol?: string;
    currency?: { code?: string };
  };
  last_trade_price?: number;
  bid_price?: number;
  ask_price?: number;
}

const BALANCES_TIMEOUT_MS = 3000;

export interface SnapTradeProviderLoaders {
  getAccounts?: (context?: ProviderContext) => Promise<SnapTradeRawAccount[]>;
  getHoldings?: (accountId: string, context?: ProviderContext) => Promise<SnapTradeRawHolding[]>;
  getQuote?: (symbol: string, context?: ProviderContext) => Promise<SnapTradeRawQuote>;
}

function createSnapTradeLoaders(
  config: SnapTradeProviderConfig,
): Required<SnapTradeProviderLoaders> {
  const normalizedBaseUrl = config.apiBaseUrl.endsWith("/")
    ? config.apiBaseUrl
    : `${config.apiBaseUrl}/`;
  const basePathPrefix = new URL(normalizedBaseUrl).pathname;

  const buildSignedRequest = (params: {
    path: string;
    query: Array<[string, string]>;
  }): { headers: HeadersInit; url: URL } => {
    const normalizedPath = params.path.startsWith("/") ? params.path.slice(1) : params.path;
    const url = new URL(normalizedPath, normalizedBaseUrl);

    for (const [key, value] of params.query) {
      url.searchParams.append(key, value);
    }

    const query = url.searchParams.toString();
    const signature = createSnapTradeSignature({
      consumerKey: config.consumerKey,
      content: null,
      path: `${basePathPrefix}${normalizedPath}`,
      query,
    });

    return {
      headers: {
        Accept: "application/json",
        Signature: signature,
      },
      url,
    };
  };

  const withCommonQuery = (
    entries: Array<[string, string]>,
  ): Array<[string, string]> => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return [
      ["clientId", config.clientId],
      ["timestamp", timestamp],
      ["userId", config.userId],
      ["userSecret", config.userSecret],
      ...entries,
    ];
  };

  const normalizeCashBalance = (balances: SnapTradeRawBalance[]): SnapTradeRawAccount["cash"] => {
    if (balances.length === 0) {
      return undefined;
    }

    const usdBalances = balances.filter((item) => item.currency?.code?.toUpperCase() === "USD");
    const balancesToSum = usdBalances.length > 0 ? usdBalances : balances;
    const amount = balancesToSum.reduce((sum, item) => sum + item.cash, 0);
    const currency = usdBalances.length > 0 ? "USD" : balancesToSum[0]?.currency?.code?.toUpperCase() ?? "USD";

    return { amount, currency };
  };

  const fetchCashBalance = async (accountId: string): Promise<SnapTradeRawAccount["cash"]> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, BALANCES_TIMEOUT_MS);

    try {
      const request = buildSignedRequest({
        path: `/accounts/${accountId}/balances`,
        query: withCommonQuery([]),
      });

      const response = await requestJson<SnapTradeRawBalance[]>(request.url, {
        headers: request.headers,
        method: "GET",
        signal: controller.signal,
      });

      return normalizeCashBalance(response);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async getAccounts() {
      const request = buildSignedRequest({
        path: "/accounts",
        query: withCommonQuery([]),
      });

      const response = await requestJson<SnapTradeAccountApiResponse[]>(request.url, {
        headers: request.headers,
        method: "GET",
      });

      const cashBalances = await Promise.all(response.map((item) => fetchCashBalance(item.id)));

      return response.map((item, index) => ({
        id: item.id,
        name: item.name ?? item.number,
        number: item.number,
        institutionName: item.institution_name,
        brokerageAuthorizationType: item.raw_type ?? undefined,
        raw_type: item.raw_type,
        account_category: item.account_category,
        balance: item.balance?.total
          ? {
              total: {
                amount: item.balance.total.amount ?? 0,
                currency: item.balance.total.currency ?? "USD",
              },
            }
          : undefined,
        cash: cashBalances[index],
      }));
    },
    async getHoldings(accountId) {
      const request = buildSignedRequest({
        path: `/accounts/${accountId}/positions`,
        query: withCommonQuery([]),
      });

      const response = await requestJson<SnapTradePositionApiResponse[]>(request.url, {
        headers: request.headers,
        method: "GET",
      });

      return response.map((item) => ({
        accountId,
        symbol: {
          symbol: item.symbol?.symbol?.symbol ?? "UNKNOWN",
          description: item.symbol?.symbol?.description ?? undefined,
          currency: item.symbol?.symbol?.currency,
          type: item.symbol?.symbol?.type,
        },
        units: item.units ?? 0,
        price: item.price ?? undefined,
        averagePurchasePrice: item.average_purchase_price ?? undefined,
        marketValue:
          item.market_value ??
          (item.price !== undefined && item.price !== null && item.units !== undefined && item.units !== null
            ? item.price * item.units
            : undefined),
      }));
    },
    async getQuote(symbol, context) {
      const rawAccountId = context?.accountId ?? config.defaultAccountId;
      const accountId = rawAccountId?.startsWith("snaptrade:")
        ? rawAccountId.slice("snaptrade:".length)
        : rawAccountId;

      if (!accountId) {
        throw new Error(
          "SnapTrade quotes require an accountId. Pass accountId to get_quote or set SNAPTRADE_DEFAULT_ACCOUNT_ID.",
        );
      }

      const request = buildSignedRequest({
        path: `/accounts/${accountId}/quotes`,
        query: withCommonQuery([
          ["symbols", symbol],
          ["use_ticker", "true"],
        ]),
      });

      const response = await requestJson<SnapTradeQuoteApiResponse[]>(request.url, {
        headers: request.headers,
        method: "GET",
      });

      const quote = response[0];

      if (!quote) {
        throw new Error(`No SnapTrade quote returned for symbol "${symbol}".`);
      }

      return {
        symbol: quote.symbol?.symbol ?? symbol,
        lastTradePrice: quote.last_trade_price ?? 0,
        currency: quote.symbol?.currency?.code ?? "USD",
        timestamp: new Date().toISOString(),
        dailyChange:
          quote.ask_price !== undefined && quote.bid_price !== undefined
            ? quote.ask_price - quote.bid_price
            : undefined,
      };
    },
  };
}

export class SnapTradeProvider extends BaseProvider {
  readonly config: SnapTradeProviderConfig;
  readonly loaders: Required<SnapTradeProviderLoaders>;

  constructor(config: SnapTradeProviderConfig, loaders?: SnapTradeProviderLoaders) {
    super({
      id: "snaptrade",
      displayName: "SnapTrade",
      capabilities: {
        accounts: true,
        holdings: true,
        transactions: false,
        quotes: true,
      },
    });

    this.config = config;
    this.loaders = loaders
      ? { ...createSnapTradeLoaders(config), ...loaders }
      : createSnapTradeLoaders(config);
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      ok: true,
      provider: this.id,
      checkedAt: new Date().toISOString(),
      details: {
        apiBaseUrl: this.config.apiBaseUrl,
        auth: "hmac-signature",
        configured: true,
        defaultAccountId: this.config.defaultAccountId ?? null,
        transactionsSupport: "not_enabled",
        transport: "http-fetch",
        userId: this.config.userId,
      },
    };
  }

  protected async fetchAccounts(context?: ProviderContext): Promise<SyncResult<CanonicalAccount>> {
    const raw = await this.loaders.getAccounts(context);
    const allAccounts = raw.map((item) => normalizeSnapTradeAccount(item));

    // StockPilot scope: exclude crypto-only accounts (Robinhood Crypto, etc.).
    // These belong to a crypto-focused product. Filter by raw_type DIGITALASSET.
    const filteredAccounts = allAccounts.filter((account) => {
      const metadata = account.metadata as Record<string, unknown> | undefined;
      const rawType = typeof metadata?.rawType === "string" ? metadata.rawType : "";
      return rawType !== "DIGITALASSET";
    });

    return {
      items: filteredAccounts,
      raw,
    };
  }

  protected async fetchHoldings(
    accountId: string,
    context?: ProviderContext,
  ): Promise<SyncResult<CanonicalHolding>> {
    const providerAccountId = this.unwrapAccountId(accountId);
    const raw = await this.loaders.getHoldings(providerAccountId, context);
    return {
      items: raw.map((item) => normalizeSnapTradeHolding(item)),
      raw,
    };
  }

  protected async fetchQuote(symbol: string, context?: ProviderContext): Promise<CanonicalQuote> {
    const raw = await this.loaders.getQuote(symbol, context);
    return normalizeSnapTradeQuote(raw);
  }

  private unwrapAccountId(accountId: string): string {
    return accountId.startsWith("snaptrade:") ? accountId.slice("snaptrade:".length) : accountId;
  }
}
