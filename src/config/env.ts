import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const snapTradeProviderConfigSchema = z.object({
  clientId: nonEmptyString,
  consumerKey: nonEmptyString,
  userId: nonEmptyString,
  userSecret: nonEmptyString,
  defaultAccountId: z.string().trim().optional(),
  apiBaseUrl: z.string().url().default("https://api.snaptrade.com/api/v1"),
});

export const appEnvSchema = z.object({
  SNAPTRADE_CLIENT_ID: z.string().trim().optional(),
  SNAPTRADE_CONSUMER_KEY: z.string().trim().optional(),
  SNAPTRADE_USER_ID: z.string().trim().optional(),
  SNAPTRADE_USER_SECRET: z.string().trim().optional(),
  SNAPTRADE_DEFAULT_ACCOUNT_ID: z.string().trim().optional(),
});

export type SnapTradeProviderConfig = z.infer<typeof snapTradeProviderConfigSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;

export interface ProviderConfigs {
  snaptrade?: SnapTradeProviderConfig;
}

export function loadProviderConfigsFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfigs {
  const parsed = appEnvSchema.parse(env);
  const configs: ProviderConfigs = {};

  if (
    parsed.SNAPTRADE_CLIENT_ID &&
    parsed.SNAPTRADE_CONSUMER_KEY &&
    parsed.SNAPTRADE_USER_ID &&
    parsed.SNAPTRADE_USER_SECRET
  ) {
    configs.snaptrade = snapTradeProviderConfigSchema.parse({
      clientId: parsed.SNAPTRADE_CLIENT_ID,
      consumerKey: parsed.SNAPTRADE_CONSUMER_KEY,
      userId: parsed.SNAPTRADE_USER_ID,
      userSecret: parsed.SNAPTRADE_USER_SECRET,
      defaultAccountId: parsed.SNAPTRADE_DEFAULT_ACCOUNT_ID,
    });
  }

  return configs;
}
