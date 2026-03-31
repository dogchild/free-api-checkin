import type { CheckInProvider } from "../core/types.js";

import { exampleProvider } from "./example.js";

// Register each supported site here.
// Adding or removing a provider only requires updating this list.
export const providers: CheckInProvider[] = [exampleProvider];

export function getRegisteredProviders(): CheckInProvider[] {
  return providers;
}
