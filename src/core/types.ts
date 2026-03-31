export type CheckInStatus = "success" | "skip" | "fail";

export interface CheckInResult {
  providerId: string;
  providerName: string;
  status: CheckInStatus;
  message: string;
}

export interface ProviderContext {
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
  log: (message: string) => void;
}

export interface CheckInProvider {
  id: string;
  displayName: string;
  requiredEnv: string[];
  run: (context: ProviderContext) => Promise<CheckInResult>;
}

export interface AppConfig {
  enabledProviderIds: string[];
  dryRun: boolean;
}
