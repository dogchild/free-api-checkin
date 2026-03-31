import type { CheckInProvider } from "../core/types.js";

const ICE_PROVIDER_ID = "ice";
const ICE_PROVIDER_NAME = "ice.v.ua";
const ICE_REFRESH_TOKEN_ENV = "ICE_SUB2API_REFRESH_TOKEN";
const ICE_API_BASE_URL = "https://ice.v.ua/api/v1";
const ICE_REQUEST_TIMEOUT_MS = 15_000;

interface RefreshedSession {
  authToken: string;
  refreshToken?: string;
}

interface IceUser {
  id?: number | string;
  email?: string;
  username?: string;
}

export const iceProvider: CheckInProvider = {
  id: ICE_PROVIDER_ID,
  displayName: ICE_PROVIDER_NAME,
  requiredEnv: [ICE_REFRESH_TOKEN_ENV],
  async run(context) {
    // This provider is auth-only for now. Dry-run should describe the intended flow
    // without making network requests or pretending the check-in already succeeded.
    if (context.dryRun) {
      context.log("Dry-run mode is enabled. No request is sent to ice.v.ua.");

      return {
        providerId: ICE_PROVIDER_ID,
        providerName: ICE_PROVIDER_NAME,
        status: "skip",
        message:
          "Dry-run would restore the session from the refresh token and verify /api/v1/auth/me. Actual check-in is not implemented yet.",
      };
    }

    const refreshToken = context.env[ICE_REFRESH_TOKEN_ENV]?.trim();

    if (!refreshToken) {
      // The runner already skips on missing env, but keeping this guard makes the
      // provider self-contained if it is ever invoked directly in tests.
      throw new Error(`Missing required environment variable: ${ICE_REFRESH_TOKEN_ENV}`);
    }

    context.log("Restoring the authenticated ice.v.ua session via refresh token.");
    const session = await refreshSession(refreshToken);

    if (session.refreshToken && session.refreshToken !== refreshToken) {
      context.log("The refresh endpoint returned an updated refresh token.");
    }

    const user = await getCurrentUser(session.authToken);
    const userLabel = formatUserLabel(user);

    context.log(`Verified authenticated session for ${userLabel}.`);

    return {
      providerId: ICE_PROVIDER_ID,
      providerName: ICE_PROVIDER_NAME,
      // Returning skip keeps the summary truthful until the provider performs the
      // final business action instead of only restoring authentication.
      status: "skip",
      message: `Login restored and verified for ${userLabel}, but actual check-in is not implemented yet.`,
    };
  },
};

async function refreshSession(refreshToken: string): Promise<RefreshedSession> {
  const responseBody = await requestJson(`${ICE_API_BASE_URL}/auth/refresh`, {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const candidates = getCandidateRecords(responseBody);
  const authToken = getFirstString(candidates, ["access_token", "auth_token"]);
  const updatedRefreshToken = getFirstString(candidates, ["refresh_token"]);

  if (!authToken) {
    throw new Error("Auth refresh response did not include an access token.");
  }

  return {
    authToken,
    refreshToken: updatedRefreshToken,
  };
}

async function getCurrentUser(authToken: string): Promise<IceUser> {
  const responseBody = await requestJson(`${ICE_API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  const user = extractUser(responseBody);

  if (!user) {
    throw new Error("Auth verification response did not include a recognizable user profile.");
  }

  return user;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(ICE_REQUEST_TIMEOUT_MS),
  });
  const responseText = await response.text();
  const parsedBody = parseJson(responseText);

  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed with ${response.status} ${response.statusText}: ${summarizeBody(parsedBody ?? responseText)}`,
    );
  }

  return parsedBody;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function summarizeBody(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= 200) {
    return normalized;
  }

  return `${normalized.slice(0, 197)}...`;
}

function extractUser(value: unknown): IceUser | null {
  const candidates = getCandidateRecords(value);

  for (const candidate of candidates) {
    if (looksLikeUser(candidate)) {
      return {
        id: asStringOrNumber(candidate.id),
        email: asOptionalString(candidate.email),
        username: asOptionalString(candidate.username),
      };
    }
  }

  return null;
}

function getCandidateRecords(value: unknown): Record<string, unknown>[] {
  const root = asRecord(value);

  if (!root) {
    return [];
  }

  const candidates = [root];
  const data = asRecord(root.data);
  const user = asRecord(root.user);
  const dataUser = data ? asRecord(data.user) : null;

  if (data) {
    candidates.push(data);
  }

  if (user) {
    candidates.push(user);
  }

  if (dataUser) {
    candidates.push(dataUser);
  }

  return candidates;
}

function getFirstString(
  candidates: Record<string, unknown>[],
  keys: string[],
): string | undefined {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = asOptionalString(candidate[key]);

      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function formatUserLabel(user: IceUser): string {
  if (user.username && user.email) {
    return `${user.username} (${user.email})`;
  }

  if (user.username) {
    return user.username;
  }

  if (user.email) {
    return user.email;
  }

  if (user.id !== undefined) {
    return `user #${user.id}`;
  }

  return "the authenticated user";
}

function looksLikeUser(value: Record<string, unknown>): boolean {
  return value.id !== undefined || typeof value.email === "string" || typeof value.username === "string";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  return undefined;
}
