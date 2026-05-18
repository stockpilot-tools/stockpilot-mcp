export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(params: { status: number; url: string; body: string }) {
    super(`HTTP ${params.status} for ${params.url}`);
    this.name = "HttpError";
    this.status = params.status;
    this.url = params.url;
    this.body = params.body;
  }
}

const MAX_RETRIES = 3;
const BACKOFF_DELAYS_MS = [1000, 2000, 4000] as const;

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, retryAt - Date.now());
}

function getBackoffDelayMs(attempt: number): number {
  return BACKOFF_DELAYS_MS[attempt] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1] ?? 0;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestJson<T>(input: URL | string, init?: RequestInit): Promise<T> {
  const url = typeof input === "string" ? input : input.toString();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(input, init);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const canRetry = shouldRetryStatus(response.status) && attempt < MAX_RETRIES;

    if (!canRetry) {
      throw new HttpError({
        status: response.status,
        url,
        body: await response.text(),
      });
    }

    await response.text();
    await sleep(parseRetryAfterMs(response.headers.get("Retry-After")) ?? getBackoffDelayMs(attempt));
  }

  throw new Error(`Unexpected retry exhaustion for ${url}`);
}
