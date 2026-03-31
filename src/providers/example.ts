import type { CheckInProvider } from "../core/types.js";

export const exampleProvider: CheckInProvider = {
  id: "example",
  displayName: "Example Provider",
  requiredEnv: [],
  async run(context) {
    // This provider is intentionally side-effect free.
    // It exists only to prove the extension points and CI wiring are working.
    if (context.dryRun) {
      context.log("Dry-run mode is enabled. No real request is sent.");

      return {
        providerId: "example",
        providerName: "Example Provider",
        status: "success",
        message: "Dry-run completed for the example provider.",
      };
    }

    context.log("This is a placeholder provider. Replace it with a real site integration.");

    return {
      providerId: "example",
      providerName: "Example Provider",
      status: "success",
      message: "Placeholder provider executed successfully.",
    };
  },
};
