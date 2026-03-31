import { loadConfig } from "./core/config.js";
import { printSummary, runProviders, shouldExitWithFailure } from "./core/runner.js";
import { getRegisteredProviders } from "./providers/index.js";

async function main(): Promise<void> {
  // CLI flags override environment-based defaults so local verification stays simple.
  const { config, warnings } = loadConfig(process.argv.slice(2));

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  const registeredProviders = getRegisteredProviders();
  const selectedProviders = registeredProviders.filter((provider) =>
    config.enabledProviderIds.includes(provider.id),
  );
  const unknownProviderIds = config.enabledProviderIds.filter(
    (providerId) => !registeredProviders.some((provider) => provider.id === providerId),
  );

  if (unknownProviderIds.length > 0) {
    console.warn(
      `Warning: Unknown provider IDs were ignored: ${unknownProviderIds.join(", ")}`,
    );
  }

  if (config.dryRun) {
    console.log("Dry-run mode enabled.");
  }

  if (selectedProviders.length === 0) {
    console.log("No valid providers selected. Nothing to run.");
    return;
  }

  console.log(`Selected providers: ${selectedProviders.map((provider) => provider.id).join(", ")}`);

  const results = await runProviders(selectedProviders, config);
  printSummary(results);

  if (shouldExitWithFailure(results)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error";
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
