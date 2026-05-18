import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadProviderConfigsFromEnv } from "./config/index.js";
import {
  createConfiguredProviders,
  createProviderMap,
  type BaseProvider,
} from "./providers/index.js";

const server = new McpServer({
  name: "stockpilot-mcp",
  version: "1.0.0",
});

const providerConfigs = loadProviderConfigsFromEnv();
const providers = createConfiguredProviders(providerConfigs);
const providerMap = createProviderMap(providers);

const providerCapabilitiesSchema = z.object({
  accounts: z.boolean(),
  holdings: z.boolean(),
  transactions: z.boolean(),
  quotes: z.boolean(),
});

const moneyAmountSchema = z.object({
  amount: z.number(),
  currency: z.string(),
});

const accountSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerAccountId: z.string(),
  name: z.string(),
  type: z.string(),
  currency: z.string(),
  institutionName: z.string().optional(),
  mask: z.string().optional(),
  balance: moneyAmountSchema.optional(),
  availableBalance: moneyAmountSchema.optional(),
  cash: moneyAmountSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const holdingSchema = z.object({
  id: z.string(),
  provider: z.string(),
  accountId: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  assetClass: z.string(),
  quantity: z.number(),
  currency: z.string(),
  price: moneyAmountSchema.optional(),
  marketValue: moneyAmountSchema.optional(),
  averagePurchasePrice: moneyAmountSchema.optional(),
  costBasis: moneyAmountSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const transactionSchema = z.object({
  id: z.string(),
  provider: z.string(),
  accountId: z.string(),
  type: z.string(),
  status: z.string().optional(),
  symbol: z.string().optional(),
  description: z.string(),
  quantity: z.number().optional(),
  price: moneyAmountSchema.optional(),
  amount: moneyAmountSchema,
  fee: moneyAmountSchema.optional(),
  occurredAt: z.string(),
  settledAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const quoteSchema = z.object({
  symbol: z.string(),
  provider: z.string(),
  price: moneyAmountSchema,
  asOf: z.string(),
  change24h: z.number().optional(),
  changePercent24h: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function requireProvider(providerId: string): BaseProvider {
  const provider = providerMap.get(providerId);

  if (!provider) {
    const availableProviders = providers.map((item) => item.id).join(", ");
    throw new Error(
      availableProviders.length > 0
        ? `Provider "${providerId}" is not configured. Available providers: ${availableProviders}.`
        : `Provider "${providerId}" is not configured. No providers are configured.`,
    );
  }

  return provider;
}

function asToolText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

server.registerTool(
  "list_providers",
  {
    description: "List configured portfolio data providers and their capabilities.",
    outputSchema: {
      providers: z.array(
        z.object({
          id: z.string(),
          displayName: z.string(),
          capabilities: providerCapabilitiesSchema,
        }),
      ),
    },
  },
  async () => {
    const structuredContent = {
      providers: providers.map((provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
      })),
    };

    return {
      content: [{ type: "text", text: asToolText(structuredContent) }],
      structuredContent,
    };
  },
);

server.registerTool(
  "list_accounts",
  {
    description: "List canonical accounts from one configured provider or all configured providers.",
    inputSchema: {
      provider: z
        .string()
        .optional()
          .describe("Optional provider id such as snaptrade."),
    },
    outputSchema: {
      accounts: z.array(accountSchema),
    },
  },
  async ({ provider }) => {
    const targetProviders = provider ? [requireProvider(provider)] : providers;
    const results = await Promise.all(targetProviders.map((item) => item.listAccounts()));
    const structuredContent = {
      accounts: results.flatMap((result) => result.items),
    };

    return {
      content: [{ type: "text", text: asToolText(structuredContent) }],
      structuredContent,
    };
  },
);

server.registerTool(
  "list_holdings",
  {
    description: "List canonical holdings for an account from a configured provider.",
    inputSchema: {
      provider: z.string().describe("Provider id such as snaptrade."),
      accountId: z
        .string()
        .describe("Canonical account id like snaptrade:account-id."),
    },
    outputSchema: {
      holdings: z.array(holdingSchema),
    },
  },
  async ({ provider, accountId }) => {
    const targetProvider = requireProvider(provider);
    const result = await targetProvider.listHoldings(accountId);
    const structuredContent = {
      holdings: result.items,
    };

    return {
      content: [{ type: "text", text: asToolText(structuredContent) }],
      structuredContent,
    };
  },
);

if (providers.some((provider) => provider.capabilities.transactions)) {
  server.registerTool(
    "list_transactions",
    {
      description: "List canonical transactions for an account from a configured provider.",
      inputSchema: {
        provider: z.string().describe("Provider id such as snaptrade."),
        accountId: z
          .string()
          .describe("Canonical account id like snaptrade:account-id."),
      },
      outputSchema: {
        transactions: z.array(transactionSchema),
      },
    },
    async ({ provider, accountId }) => {
      const targetProvider = requireProvider(provider);
      const result = await targetProvider.listTransactions(accountId);
      const structuredContent = {
        transactions: result.items,
      };

      return {
        content: [{ type: "text", text: asToolText(structuredContent) }],
        structuredContent,
      };
    },
  );
}

server.registerTool(
  "get_quote",
  {
    description: "Get a canonical market quote for a symbol from a configured provider.",
    inputSchema: {
      provider: z.string().describe("Provider id such as snaptrade."),
      symbol: z.string().describe("Ticker or asset symbol, for example BTC or AAPL."),
      accountId: z
        .string()
        .optional()
        .describe("Optional canonical account id. Required by providers like SnapTrade for quotes."),
    },
    outputSchema: {
      quote: quoteSchema,
    },
  },
  async ({ provider, symbol, accountId }) => {
    const targetProvider = requireProvider(provider);
    const structuredContent = {
      quote: await targetProvider.getQuote(symbol, { accountId }),
    };

    return {
      content: [{ type: "text", text: asToolText(structuredContent) }],
      structuredContent,
    };
  },
);

server.registerTool(
  "get_provider_health",
  {
    description: "Check health for one configured provider or all configured providers.",
    inputSchema: {
      provider: z
        .string()
        .optional()
          .describe("Optional provider id such as snaptrade."),
    },
    outputSchema: {
      health: z.array(
        z.object({
          ok: z.boolean(),
          provider: z.string(),
          checkedAt: z.string(),
          details: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    },
  },
  async ({ provider }) => {
    const targetProviders = provider ? [requireProvider(provider)] : providers;
    const health = await Promise.all(targetProviders.map((item) => item.getHealth()));
    const structuredContent = { health };

    return {
      content: [{ type: "text", text: asToolText(structuredContent) }],
      structuredContent,
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    providers.length > 0
      ? `stockpilot-mcp running on stdio with providers: ${providers.map((item) => item.id).join(", ")}`
      : "stockpilot-mcp running on stdio with no configured providers",
  );
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});
