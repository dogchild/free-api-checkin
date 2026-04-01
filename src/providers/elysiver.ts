import type { CheckInProvider } from "../core/types.js";

const ELYSIVER_PROVIDER_ID = "elysiver";
const ELYSIVER_PROVIDER_NAME = "elysiver.h-e.top";
const ELYSIVER_BASE_URL = "https://elysiver.h-e.top";
const ELYSIVER_SELF_PATH = "/api/user/self";
const ELYSIVER_AUTH_TOKEN_ENV = "ELYSIVER_AUTH_TOKEN";
const ELYSIVER_USER_ID_ENV = "ELYSIVER_USER_ID";
const ELYSIVER_REQUEST_TIMEOUT_MS = 15_000;

interface JsonResponse {
  body: string;
  response: Response;
}

interface ElysiverUserSelfResponse {
  success?: boolean;
  message?: string;
  data?: {
    id?: number | string;
    username?: string;
  };
  id?: number | string;
  username?: string;
}

export const elysiverProvider: CheckInProvider = {
  id: ELYSIVER_PROVIDER_ID,
  displayName: ELYSIVER_PROVIDER_NAME,
  requiredEnv: [ELYSIVER_AUTH_TOKEN_ENV, ELYSIVER_USER_ID_ENV],
  async run(context) {
    // Phase 1 for elysiver only verifies that a manually recovered NewAPI login
    // state is still accepted by the site. The real daily check-in flow will be
    // analyzed separately after auth restoration is confirmed to work.
    if (context.dryRun) {
      context.log("Dry-run mode is enabled. No request is sent to elysiver.h-e.top.");

      return {
        providerId: ELYSIVER_PROVIDER_ID,
        providerName: ELYSIVER_PROVIDER_NAME,
        status: "skip",
        message:
          "Dry-run would call the NewAPI user-self endpoint with ELYSIVER_AUTH_TOKEN and ELYSIVER_USER_ID to verify auth restoration.",
      };
    }

    const authToken = context.env[ELYSIVER_AUTH_TOKEN_ENV]?.trim();
    const expectedUserId = context.env[ELYSIVER_USER_ID_ENV]?.trim();

    if (!authToken || !expectedUserId) {
      throw new Error(
        `Missing required environment variables: ${[ELYSIVER_AUTH_TOKEN_ENV, ELYSIVER_USER_ID_ENV].join(", ")}`,
      );
    }

    context.log("Verifying the restored NewAPI login state through /api/user/self.");
    const selfResponse = await requestJson(`${ELYSIVER_BASE_URL}${ELYSIVER_SELF_PATH}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        // Mirror the authenticated API pattern observed on the NewAPI frontend so
        // the check stays close to the real browser flow.
        "New-API-User": expectedUserId,
        Origin: ELYSIVER_BASE_URL,
        Referer: `${ELYSIVER_BASE_URL}/console/personal`,
      },
    });

    if (!selfResponse.response.ok) {
      throw new Error(buildAuthVerificationError(selfResponse.response, selfResponse.body));
    }

    const payload = parseUserSelfResponse(selfResponse.body);
    const actualUserId = extractUserId(payload);

    if (!actualUserId) {
      throw new Error(
        `The NewAPI user-self response did not contain a recognizable user id. Response: ${summarizeBody(selfResponse.body)}`,
      );
    }

    if (actualUserId !== expectedUserId) {
      throw new Error(
        `The restored login belongs to user ${actualUserId}, but ELYSIVER_USER_ID is ${expectedUserId}. Response: ${summarizeBody(selfResponse.body)}`,
      );
    }

    const username = extractUsername(payload);
    const usernameSuffix = username ? ` Username: ${username}.` : "";

    return {
      providerId: ELYSIVER_PROVIDER_ID,
      providerName: ELYSIVER_PROVIDER_NAME,
      status: "success",
      message: `Auth restoration verified successfully for user ${actualUserId}.${usernameSuffix} Daily check-in is not implemented yet.`,
    };
  },
};

function buildAuthVerificationError(response: Response, body: string): string {
  const summary = summarizeBody(body);

  if (response.status === 401 || response.status === 403) {
    return `Failed to verify the restored login because ELYSIVER_AUTH_TOKEN is invalid or expired, or ELYSIVER_USER_ID does not match the token. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  return `The NewAPI user-self request failed with ${response.status} ${response.statusText}: ${summary}`;
}

function parseUserSelfResponse(body: string): ElysiverUserSelfResponse {
  try {
    return JSON.parse(body) as ElysiverUserSelfResponse;
  } catch {
    throw new Error(
      `The NewAPI user-self request did not return valid JSON. Response: ${summarizeBody(body)}`,
    );
  }
}

function extractUserId(payload: ElysiverUserSelfResponse): string | null {
  const rawId = payload.data?.id ?? payload.id;

  if (rawId === undefined || rawId === null) {
    return null;
  }

  const normalized = String(rawId).trim();

  return normalized || null;
}

function extractUsername(payload: ElysiverUserSelfResponse): string | null {
  const rawUsername = payload.data?.username ?? payload.username;

  if (typeof rawUsername !== "string") {
    return null;
  }

  const normalized = rawUsername.trim();

  return normalized || null;
}

async function requestJson(url: string, init: RequestInit): Promise<JsonResponse> {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/plain, */*");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(ELYSIVER_REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();

  return {
    body,
    response,
  };
}

function summarizeBody(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= 200) {
    return normalized;
  }

  return `${normalized.slice(0, 197)}...`;
}
