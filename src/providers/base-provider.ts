import {
  type CanonicalAccount,
  type CanonicalHolding,
  type CanonicalQuote,
  type CanonicalTransaction,
  type ProviderId,
  type SyncResult,
} from "../types/index.js";

export interface ProviderCapabilities {
  accounts: boolean;
  holdings: boolean;
  transactions: boolean;
  quotes: boolean;
}

export interface ProviderContext {
  requestId?: string;
  userId?: string;
  accountId?: string;
}

export interface ProviderHealth {
  ok: boolean;
  provider: ProviderId;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly code: string;
  readonly cause?: unknown;

  constructor(params: {
    provider: ProviderId;
    code: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "ProviderError";
    this.provider = params.provider;
    this.code = params.code;
    this.cause = params.cause;
  }
}

export abstract class BaseProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  protected constructor(params: {
    id: ProviderId;
    displayName: string;
    capabilities: ProviderCapabilities;
  }) {
    this.id = params.id;
    this.displayName = params.displayName;
    this.capabilities = params.capabilities;
  }

  abstract getHealth(context?: ProviderContext): Promise<ProviderHealth>;

  async listAccounts(context?: ProviderContext): Promise<SyncResult<CanonicalAccount>> {
    this.assertCapability("accounts");
    return this.fetchAccounts(context);
  }

  async listHoldings(
    accountId: string,
    context?: ProviderContext,
  ): Promise<SyncResult<CanonicalHolding>> {
    this.assertCapability("holdings");
    return this.fetchHoldings(accountId, context);
  }

  async listTransactions(
    accountId: string,
    context?: ProviderContext,
  ): Promise<SyncResult<CanonicalTransaction>> {
    this.assertCapability("transactions");
    return this.fetchTransactions(accountId, context);
  }

  async getQuote(symbol: string, context?: ProviderContext): Promise<CanonicalQuote> {
    this.assertCapability("quotes");
    return this.fetchQuote(symbol, context);
  }

  protected async fetchAccounts(_context?: ProviderContext): Promise<SyncResult<CanonicalAccount>> {
    return this.unsupported("accounts");
  }

  protected async fetchHoldings(
    _accountId: string,
    _context?: ProviderContext,
  ): Promise<SyncResult<CanonicalHolding>> {
    return this.unsupported("holdings");
  }

  protected async fetchTransactions(
    _accountId: string,
    _context?: ProviderContext,
  ): Promise<SyncResult<CanonicalTransaction>> {
    return this.unsupported("transactions");
  }

  protected async fetchQuote(
    _symbol: string,
    _context?: ProviderContext,
  ): Promise<CanonicalQuote> {
    return this.unsupported("quotes");
  }

  protected makeProviderError(code: string, message: string, cause?: unknown): ProviderError {
    return new ProviderError({
      provider: this.id,
      code,
      message,
      cause,
    });
  }

  protected normalizeCurrency(value: string): string {
    return value.trim().toUpperCase();
  }

  protected normalizeTimestamp(value: string | Date): string {
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  private assertCapability(capability: keyof ProviderCapabilities): void {
    if (!this.capabilities[capability]) {
      throw this.makeProviderError(
        "UNSUPPORTED_CAPABILITY",
        `${this.displayName} does not support ${capability}.`,
      );
    }
  }

  private async unsupported(capability: keyof ProviderCapabilities): Promise<never> {
    throw this.makeProviderError(
      "UNSUPPORTED_CAPABILITY",
      `${this.displayName} does not support ${capability}.`,
    );
  }
}
