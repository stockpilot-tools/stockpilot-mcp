import type { ProviderConfigs } from "../config/index.js";
import type { BaseProvider } from "./base-provider.js";
import { SnapTradeProvider } from "./snaptrade-provider.js";

export function createConfiguredProviders(configs: ProviderConfigs): BaseProvider[] {
  const providers: BaseProvider[] = [];

  if (configs.snaptrade) {
    providers.push(new SnapTradeProvider(configs.snaptrade));
  }

  return providers;
}

export function createProviderMap(providers: BaseProvider[]): Map<string, BaseProvider> {
  return new Map(providers.map((provider) => [provider.id, provider]));
}
