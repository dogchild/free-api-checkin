import { validateRequiredEnv } from "./config.js";
import type { AppConfig, CheckInProvider, CheckInResult, ProviderContext } from "./types.js";

export async function runProviders(
  providers: CheckInProvider[],
  config: AppConfig,
): Promise<CheckInResult[]> {
  const results: CheckInResult[] = [];

  for (const provider of providers) {
    const missingEnv = validateRequiredEnv(provider, process.env);

    if (missingEnv.length > 0) {
      const message = `Skipped because required environment variables are missing: ${missingEnv.join(", ")}`;
      console.log(`[${provider.id}] ${message}`);
      results.push({
        providerId: provider.id,
        providerName: provider.displayName,
        status: "skip",
        message,
      });
      continue;
    }

    const context: ProviderContext = {
      dryRun: config.dryRun,
      env: process.env,
      // Prefix provider logs so a single GitHub Actions run remains readable when more sites are added.
      log: (message) => console.log(`[${provider.id}] ${message}`),
    };

    try {
      const result = await provider.run(context);
      console.log(`[${provider.id}] ${result.status.toUpperCase()}: ${result.message}`);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[${provider.id}] FAIL: ${message}`);
      results.push({
        providerId: provider.id,
        providerName: provider.displayName,
        status: "fail",
        message,
      });
    }
  }

  return results;
}

export function printSummary(results: CheckInResult[]): void {
  const successCount = results.filter((result) => result.status === "success").length;
  const skipCount = results.filter((result) => result.status === "skip").length;
  const failCount = results.filter((result) => result.status === "fail").length;

  console.log("\nSummary");
  console.log(`- Success: ${successCount}`);
  console.log(`- Skip: ${skipCount}`);
  console.log(`- Fail: ${failCount}`);
}

export function shouldExitWithFailure(results: CheckInResult[]): boolean {
  return results.some((result) => result.status === "fail");
}
