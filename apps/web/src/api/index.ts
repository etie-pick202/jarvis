import { request } from "./client.js";
import { type Health, parseHealth } from "./contracts.js";

export * from "./client.js";
export * from "./contracts.js";

export const api = {
  health: (signal?: AbortSignal): Promise<Health> => request("/health", { signal, parse: parseHealth }),
};
