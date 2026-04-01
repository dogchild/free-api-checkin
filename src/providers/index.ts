import type { CheckInProvider } from "../core/types.js";

import { exampleProvider } from "./example.js";
import { elysiverProvider } from "./elysiver.js";
import { iceProvider } from "./ice.js";

// Register each supported site here.
// Adding or removing a provider only requires updating this list.
export const providers: CheckInProvider[] = [exampleProvider, elysiverProvider, iceProvider];

export function getRegisteredProviders(): CheckInProvider[] {
  return providers;
}
