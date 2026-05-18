import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type JsonObject = Record<string, unknown>;

interface ToolCallOutput {
  name: string;
  result: unknown;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const tmpDir = path.join(projectRoot, "tmp");
const envFilePath = path.join(projectRoot, ".env.local");

function parseEnvFile(contents: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value.replace(/\\n/g, "\n");
  }

  return env;
}

async function loadLocalEnv(): Promise<Record<string, string>> {
  const contents = await readFile(envFilePath, "utf8");
  return parseEnvFile(contents);
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await mkdir(tmpDir, { recursive: true });
  const target = path.join(tmpDir, name);
  await writeFile(target, `${JSON.stringify(data, null, 2)}
`, "utf8");
}

async function callTool(
  client: Client,
  name: string,
  args?: JsonObject,
): Promise<ToolCallOutput> {
  const result = await client.callTool({
    name,
    arguments: args ?? {},
  });

  const payload = {
    args: args ?? {},
    result,
  };

  await writeJson(`${name}.json`, payload);

  if ((result as { isError?: boolean }).isError) {
    throw new Error(`Tool ${name} failed: ${JSON.stringify(result, null, 2)}`);
  }

  return { name, result };
}

function extractStructuredContent(result: unknown): JsonObject | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent;
  if (!structuredContent || typeof structuredContent !== "object") {
    return undefined;
  }

  return structuredContent as JsonObject;
}

function getObjectArray<T extends JsonObject>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((item): item is T => !!item && typeof item === "object")) : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getMoneyAmount(value: unknown): { amount: number; currency: string } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const amount = (value as JsonObject).amount;
  const currency = (value as JsonObject).currency;

  if (typeof amount !== "number" || typeof currency !== "string") {
    return undefined;
  }

  return { amount, currency };
}

function summarizeSymbols(holdings: JsonObject[]): string[] {
  return [...new Set(holdings.map((item) => getString(item.symbol)).filter((value): value is string => Boolean(value)))].sort();
}

function assertQuotePricePositive(output: ToolCallOutput): void {
  const structured = extractStructuredContent(output.result);
  const quote = structured?.quote;

  if (!quote || typeof quote !== "object") {
    throw new Error(`Tool ${output.name} did not return a structured quote.`);
  }

  const price = getMoneyAmount((quote as JsonObject).price);

  if (!price || price.amount <= 0) {
    throw new Error(`Tool ${output.name} returned a quote without price.amount > 0.`);
  }
}

async function main(): Promise<void> {
  await mkdir(tmpDir, { recursive: true });
  await rm(path.join(tmpDir, "smoke.error.json"), { force: true });

  const env = await loadLocalEnv();
  const client = new Client(
    { name: "stockpilot-smoke", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    cwd: projectRoot,
    env: {
      ...process.env,
      ...env,
    },
    stderr: "inherit",
  });

  await client.connect(transport);

  try {
    const tools = await client.listTools();
    await writeJson("listTools.json", tools);

    const toolNames = tools.tools.map((tool) => tool.name).sort();
    console.log(`Tools: ${toolNames.join(", ")}`);

    const providersOutput = await callTool(client, "list_providers");
    const providersStructured = extractStructuredContent(providersOutput.result);
    const providers = getObjectArray<JsonObject>(providersStructured?.providers);

    const providerIds = providers
      .map((item) => getString(item.id))
      .filter((value): value is string => Boolean(value));

    console.log(`Configured providers: ${providerIds.join(", ") || "(none)"}`);

    const snaptradeAccountsOutput = await callTool(client, "list_accounts", {
      provider: "snaptrade",
    });
    const snaptradeAccountsStructured = extractStructuredContent(snaptradeAccountsOutput.result);
    const snaptradeAccounts = getObjectArray<JsonObject>(snaptradeAccountsStructured?.accounts);

    console.log(`SnapTrade accounts: ${snaptradeAccounts.length}`);
    await writeJson("accounts.snaptrade.json", snaptradeAccounts);

    if (snaptradeAccounts.length < 3) {
      throw new Error(`Expected at least 3 SnapTrade non-crypto accounts, got ${snaptradeAccounts.length}`);
    }

    const cryptoLeaked = snaptradeAccounts.filter((account) => {
      const metadata = account.metadata as JsonObject | undefined;
      const rawType = getString(metadata?.rawType) ?? "";
      return rawType === "DIGITALASSET";
    });

    if (cryptoLeaked.length > 0) {
      throw new Error(`StockPilot leaked ${cryptoLeaked.length} crypto accounts: filter failed`);
    }

    const robinhoodCryptoFound = snaptradeAccounts.find((account) => {
      const name = getString(account.name) ?? "";
      const mask = getString(account.mask) ?? "";
      return name.toLowerCase().includes("crypto") || mask === "6201";
    });

    if (robinhoodCryptoFound) {
      throw new Error("StockPilot found Robinhood Crypto account, filter failed");
    }

    let snaptradeAccountsWithCash = 0;
    let snaptradeCashTotalUsd = 0;
    let snaptradeMarketValueTotalUsd = 0;
    let brkaCostBasisUsd: number | undefined;
    let brkaAveragePurchasePriceUsd: number | undefined;

    const holdingSummaries: Array<{ accountId: string; symbols: string[] }> = [];

    for (const account of snaptradeAccounts) {
      const accountId = getString(account.id);

      if (!accountId) {
        continue;
      }

      const cash = getMoneyAmount(account.cash);
      if (cash && cash.amount >= 0) {
        snaptradeAccountsWithCash += 1;

        if (cash.currency.toUpperCase() === "USD") {
          snaptradeCashTotalUsd += cash.amount;
        }
      }

      const holdingsOutput = await callTool(client, "list_holdings", {
        provider: "snaptrade",
        accountId,
      });
      const holdingsStructured = extractStructuredContent(holdingsOutput.result);
      const holdings = getObjectArray<JsonObject>(holdingsStructured?.holdings);
      const symbols = summarizeSymbols(holdings);

      for (const holding of holdings) {
        const symbol = getString(holding.symbol);
        const quantity = typeof holding.quantity === "number" ? holding.quantity : undefined;
        const costBasis = getMoneyAmount(holding.costBasis);
        const averagePurchasePrice = getMoneyAmount(holding.averagePurchasePrice);
        const marketValue = getMoneyAmount(holding.marketValue);

        if (marketValue?.currency.toUpperCase() === "USD") {
          snaptradeMarketValueTotalUsd += marketValue.amount;
        }

        if (quantity !== undefined && quantity < 1 && costBasis && costBasis.amount > 100000) {
          throw new Error(
            `SnapTrade holding ${symbol ?? "(unknown)"} has quantity < 1 and costBasis > $100,000.`,
          );
        }

        if (symbol === "BRK.A") {
          brkaCostBasisUsd = costBasis?.amount;
          brkaAveragePurchasePriceUsd = averagePurchasePrice?.amount;

          if (!costBasis || costBasis.amount >= 10000) {
            throw new Error(`Expected BRK.A costBasis < $10,000, got ${costBasis?.amount ?? "(missing)"}.`);
          }

          if (!averagePurchasePrice || averagePurchasePrice.amount <= 700000) {
            throw new Error(
              `Expected BRK.A averagePurchasePrice > $700,000, got ${averagePurchasePrice?.amount ?? "(missing)"}.`,
            );
          }
        }
      }

      holdingSummaries.push({ accountId, symbols });
      await writeJson(`holdings.snaptrade.${accountId.replaceAll(":", "_")}.json`, holdings);

      console.log(`snaptrade holdings for ${accountId}: ${symbols.join(", ") || "(none)"}`);
      console.log(
        `SnapTrade cash for ${accountId}: ${
          cash ? `${cash.amount.toFixed(2)} ${cash.currency.toUpperCase()}` : "(none)"
        }`,
      );
    }

    const snaptradeSymbols = [
      ...new Set(holdingSummaries.flatMap((summary) => summary.symbols)),
    ].sort();

    if (snaptradeAccountsWithCash === 0) {
      throw new Error("Expected at least one SnapTrade account with cash >= 0 populated.");
    }

    const firstSnaptradeSymbol = snaptradeSymbols[0];
    const firstSnaptradeAccountId = getString(snaptradeAccounts[0]?.id);
    if (firstSnaptradeSymbol && firstSnaptradeAccountId) {
      const output = await callTool(client, "get_quote", {
        provider: "snaptrade",
        symbol: firstSnaptradeSymbol,
        accountId: firstSnaptradeAccountId,
      });
      assertQuotePricePositive(output);
    }

    await callTool(client, "get_provider_health");

    const portfolioTotalUsd = snaptradeMarketValueTotalUsd + snaptradeCashTotalUsd;
    await writeJson("summary.json", {
      brkaAveragePurchasePriceUsd,
      brkaCostBasisUsd,
      filteredAccountCount: snaptradeAccounts.length,
      portfolioTotalUsd,
      robinhoodCryptoExcluded: true,
      snaptradeAccountCount: snaptradeAccounts.length,
      snaptradeCashTotalUsd,
      snaptradeMarketValueTotalUsd,
      snaptradeSymbols,
      toolNames,
    });

    console.log(`Unique SnapTrade symbols: ${snaptradeSymbols.join(", ") || "(none)"}`);
    console.log(`SnapTrade total market value: ${snaptradeMarketValueTotalUsd.toFixed(2)} USD`);
    console.log(`SnapTrade total cash: ${snaptradeCashTotalUsd.toFixed(2)} USD`);
    console.log(`Portfolio total (no crypto): ${portfolioTotalUsd.toFixed(2)} USD`);
    console.log("Smoke test completed successfully.");
  } finally {
    await transport.close();
  }
}

main().catch(async (error: unknown) => {
  await writeJson("smoke.error.json", {
    error:
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
          }
        : error,
  });

  console.error(error);
  process.exit(1);
});
