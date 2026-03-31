import dotenv from "dotenv";

import type { AppConfig, CheckInProvider } from "./types.js";

export interface ConfigLoadResult {
  config: AppConfig;
  warnings: string[];
}

export function loadConfig(argv: string[]): ConfigLoadResult {
  dotenv.config();

  const warnings: string[] = [];
  const dryRun = hasDryRunFlag(argv) || parseBoolean(process.env.CHECKIN_DRY_RUN);
  const enabledProviderIds = parseEnabledProviders(process.env.CHECKIN_ENABLED);

  if (enabledProviderIds.length === 0) {
    warnings.push(
      "No providers are enabled. Set CHECKIN_ENABLED to a comma-separated list such as 'example'.",
    );
  }

  return {
    config: {
      enabledProviderIds,
      dryRun,
    },
    warnings,
  };
}

export function validateRequiredEnv(provider: CheckInProvider, env: NodeJS.ProcessEnv): string[] {
  // Provider-specific secrets are validated centrally so each provider can focus on sign-in logic.
  return provider.requiredEnv.filter((key) => !env[key]?.trim());
}

function parseEnabledProviders(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function hasDryRunFlag(argv: string[]): boolean {
  return argv.includes("--dry-run");
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
