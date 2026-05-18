import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type JsonObject = Record<string, unknown>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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

function extractStructuredContent(result: unknown): JsonObject | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent;
  return structuredContent && typeof structuredContent === "object"
    ? (structuredContent as JsonObject)
    : undefined;
}

function getObjectArray<T extends JsonObject>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((item): item is T => !!item && typeof item === "object")) : [];
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function withTimeout<T>(label: string, ms: number, operation: () => Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} exceeded ${ms}ms timeout.`));
        }, ms);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function timedCall(
  client: Client,
  label: string,
  name: string,
  args?: JsonObject,
): Promise<unknown> {
  const startedAt = performance.now();
  const result = await withTimeout(label, 15000, () =>
    client.callTool({
      name,
      arguments: args ?? {},
    }),
  );
  const elapsedMs = performance.now() - startedAt;

  console.log(`${label}: ${elapsedMs.toFixed(0)}ms`);

  if (elapsedMs > 10000) {
    throw new Error(`${label} took ${elapsedMs.toFixed(0)}ms, expected <= 10000ms.`);
  }

  if ((result as { isError?: boolean }).isError) {
    throw new Error(`${label} returned tool error: ${JSON.stringify(result)}`);
  }

  return result;
}

const env = {
  ...process.env,
  ...parseEnvFile(await readFile(path.join(projectRoot, ".env.local"), "utf8")),
};
const client = new Client(
  { name: "stockpilot-quote-stress", version: "1.0.0" },
  { capabilities: {} },
);
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
  cwd: projectRoot,
  env,
  stderr: "inherit",
});

await client.connect(transport);

try {
  const accountsResult = await timedCall(client, "warmup list_accounts", "list_accounts");
  const accounts = getObjectArray<JsonObject>(extractStructuredContent(accountsResult)?.accounts);
  const rothIra = accounts.find((account) => {
    const provider = getString(account.provider);
    const name = getString(account.name) ?? "";
    const mask = getString(account.mask) ?? "";

    return provider === "snaptrade" && (name.toLowerCase().includes("roth") || mask === "7655");
  });
  const rothIraAccountId = getString(rothIra?.id);

  if (!rothIraAccountId) {
    throw new Error("Could not find SnapTrade Roth IRA account for quote stress test.");
  }

  for (let index = 1; index <= 8; index += 1) {
    await timedCall(client, `snaptrade AAPL quote ${index}`, "get_quote", {
      accountId: rothIraAccountId,
      provider: "snaptrade",
      symbol: "AAPL",
    });
  }

  for (let index = 1; index <= 3; index += 1) {
    await timedCall(client, `provider health ${index}`, "get_provider_health");
  }

  console.log("Quote stress completed successfully.");
} finally {
  await transport.close();
}
