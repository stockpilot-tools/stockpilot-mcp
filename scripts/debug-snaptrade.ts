import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProviderConfigsFromEnv } from "../src/config/index.js";
import { SnapTradeProvider } from "../src/providers/snaptrade-provider.js";

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

const env = {
  ...process.env,
  ...parseEnvFile(await readFile(path.join(projectRoot, ".env.local"), "utf8")),
};
const configs = loadProviderConfigsFromEnv(env);

if (!configs.snaptrade) {
  throw new Error("SnapTrade is not configured in .env.local.");
}

const provider = new SnapTradeProvider(configs.snaptrade);
const rawAccounts = await provider.loaders.getAccounts();
const canonicalAccounts = await provider.listAccounts();

console.log(`Raw getAccounts length: ${rawAccounts.length}`);
console.log(JSON.stringify(rawAccounts, null, 2));
console.log(`Canonical listAccounts length: ${canonicalAccounts.items.length}`);

if (canonicalAccounts.items.length < 3) {
  throw new Error(
    `Expected at least 3 non-crypto SnapTrade accounts after filter, got ${canonicalAccounts.items.length}.`,
  );
}

for (const account of rawAccounts) {
  console.log(
    [
      `id=${account.id}`,
      `number=${account.number ?? "(none)"}`,
      `institution_name=${account.institutionName ?? "(none)"}`,
      `raw_type=${account.raw_type ?? "(none)"}`,
      `name=${account.name}`,
    ].join(" "),
  );
}
