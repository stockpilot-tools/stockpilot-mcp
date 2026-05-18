import { createHmac } from "node:crypto";

function orderedJsonStringify(value: unknown): string {
  const allKeys: string[] = [];
  const seen: Record<string, null> = {};

  JSON.stringify(value, (key, currentValue) => {
    if (!(key in seen)) {
      allKeys.push(key);
      seen[key] = null;
    }

    return currentValue;
  });

  allKeys.sort();
  return JSON.stringify(value, allKeys);
}

export function createSnapTradeSignature(params: {
  consumerKey: string;
  path: string;
  query: string;
  content: unknown;
}): string {
  const consumerKey = encodeURI(params.consumerKey);
  const sigContent = orderedJsonStringify({
    content: params.content,
    path: params.path,
    query: params.query,
  });

  const hmac = createHmac("sha256", consumerKey);
  hmac.update(sigContent);
  return hmac.digest("base64");
}
