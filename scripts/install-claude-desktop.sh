#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_CONFIG="${PROJECT_ROOT}/claude_desktop_config.example.json"
CLAUDE_CONFIG_DIR="${HOME}/Library/Application Support/Claude"
CLAUDE_CONFIG="${CLAUDE_CONFIG_DIR}/claude_desktop_config.json"

if [[ ! -f "${EXAMPLE_CONFIG}" ]]; then
  echo "Example config not found: ${EXAMPLE_CONFIG}" >&2
  exit 1
fi

mkdir -p "${CLAUDE_CONFIG_DIR}"

if [[ ! -f "${CLAUDE_CONFIG}" ]]; then
  cp "${EXAMPLE_CONFIG}" "${CLAUDE_CONFIG}"
  echo "Created Claude Desktop config:"
  echo "  ${CLAUDE_CONFIG}"
  echo
  echo "Next steps:"
  echo "  1. Edit the env values in ${CLAUDE_CONFIG}"
  echo "  2. Restart Claude Desktop"
  exit 0
fi

echo "Claude Desktop config already exists:"
echo "  ${CLAUDE_CONFIG}"
echo
echo "Not overwriting it. Suggested diff against the Stockpilot example:"
echo
diff -u "${CLAUDE_CONFIG}" "${EXAMPLE_CONFIG}" || true
echo
echo "Manual steps:"
echo "  1. Add or merge the mcpServers.stockpilot block from ${EXAMPLE_CONFIG}"
echo "  2. Replace all REPLACE_ME values with real credentials"
echo "  3. Restart Claude Desktop"
