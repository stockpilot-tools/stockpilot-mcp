# Stockpilot MCP

MCP server for portfolio data from Coinbase and SnapTrade.

## Setup

Install dependencies and build the server:

```bash
npm install
npm run build
```

The compiled MCP entrypoint is `dist/server.js`.

## Environment Variables

Create a local env file from the example:

```bash
cp .env.example .env.local
```

Fill in these values in `.env.local`:

```bash
COINBASE_API_KEY_NAME=
COINBASE_API_PRIVATE_KEY=
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
SNAPTRADE_USER_ID=
SNAPTRADE_USER_SECRET=
SNAPTRADE_DEFAULT_ACCOUNT_ID=
```

Do not commit `.env.local`; it is ignored by git.

## Smoke Test

After building, run the smoke test against the compiled server:

```bash
npx tsx scripts/smoke.ts
```

The smoke test writes outputs to `tmp/`, including `tmp/summary.json`, account snapshots, holdings snapshots, and quote responses.

## Claude Desktop Integration

Build the server first:

```bash
npm run build
```

Then install the Claude Desktop config:

```bash
./scripts/install-claude-desktop.sh
```

If Claude Desktop does not already have a config, the script copies `claude_desktop_config.example.json` to:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Edit that Claude Desktop config and replace every `REPLACE_ME` value with real credentials. If the config already exists, the script does not overwrite it; it prints a suggested diff so you can merge the `mcpServers.stockpilot` block manually.

Restart Claude Desktop after editing the config.

## Available Tools

- `list_providers`: lists configured providers and their capabilities.
- `list_accounts`: lists canonical accounts from one provider or all configured providers.
- `list_holdings`: lists canonical holdings for a provider account.
- `get_quote`: returns a canonical market quote for a symbol.
- `get_provider_health`: returns provider health and configuration status.

## Known Limitations

- Transactions are not exposed, so `list_transactions` is not registered.
- Coinbase assets without a USD product pair are returned without price or market value.
