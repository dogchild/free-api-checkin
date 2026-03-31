import type { CheckInProvider } from "../core/types.js";

const ICE_PROVIDER_ID = "ice";
const ICE_PROVIDER_NAME = "ice.v.ua";
const ICE_AUTH_TOKEN_ENV = "ICE_SUB2API_AUTH_TOKEN";
const ICE_USER_ID_ENV = "ICE_SUB2API_USER_ID";
const ICE_SIGNV_BASE_URL = "https://signv.ice.v.ua";
const ICE_SIGNV_EMBED_PATH = "/embed";
const ICE_SIGNV_CHECKIN_PATH = "/checkin?next=/embed";
const ICE_REQUEST_TIMEOUT_MS = 15_000;
const ICE_SOURCE_HOST_URL = "https://ice.v.ua/";
const ICE_SOURCE_PAGE_URL = "https://ice.v.ua/custom/f8c961a6027f9cb0";
const CHECK_IN_SUCCESS_TEXT = "签到成功";
const CHECK_IN_ALREADY_DONE_TEXT = "今日已签到";

interface TextResponse {
  body: string;
  response: Response;
}

interface SignvSession {
  cookie: string;
  initialPageHtml: string;
}

interface CheckInOutcome {
  logMessage: string;
  resultMessage: string;
  noticeText: string;
}

export const iceProvider: CheckInProvider = {
  id: ICE_PROVIDER_ID,
  displayName: ICE_PROVIDER_NAME,
  requiredEnv: [ICE_AUTH_TOKEN_ENV, ICE_USER_ID_ENV],
  async run(context) {
    // The lightweight mode mirrors the real iframe flow from the custom page by
    // reusing the current auth token and user id directly, without relying on a
    // rotating refresh token that GitHub Actions cannot persist safely by default.
    if (context.dryRun) {
      context.log("Dry-run mode is enabled. No request is sent to signv.ice.v.ua.");

      return {
        providerId: ICE_PROVIDER_ID,
        providerName: ICE_PROVIDER_NAME,
        status: "skip",
        message:
          "Dry-run would create a signv session from ICE_SUB2API_AUTH_TOKEN and ICE_SUB2API_USER_ID, then submit the daily check-in form.",
      };
    }

    const authToken = context.env[ICE_AUTH_TOKEN_ENV]?.trim();
    const userId = context.env[ICE_USER_ID_ENV]?.trim();

    if (!authToken || !userId) {
      // The runner already skips when required env is missing, but keeping a local
      // guard makes the provider explicit and safer to invoke directly in tests.
      throw new Error(
        `Missing required environment variables: ${[ICE_AUTH_TOKEN_ENV, ICE_USER_ID_ENV].join(", ")}`,
      );
    }

    context.log("Creating the signv session from the main-site auth token.");
    const signvSession = await establishSignvSession({ authToken, userId });
    const embeddedOutcome = parseCheckInOutcome(signvSession.initialPageHtml);

    if (embeddedOutcome) {
      context.log(embeddedOutcome.logMessage);

      return {
        providerId: ICE_PROVIDER_ID,
        providerName: ICE_PROVIDER_NAME,
        status: "success",
        message: `${embeddedOutcome.resultMessage} Service message: ${embeddedOutcome.noticeText}.`,
      };
    }

    context.log("Submitting the daily check-in form on signv.ice.v.ua.");
    const checkInPageHtml = await submitCheckIn(signvSession.cookie);
    const outcome = parseCheckInOutcome(checkInPageHtml);

    if (!outcome) {
      const noticeText = extractNoticeText(checkInPageHtml);
      const responseHint = noticeText ? `Service message: ${noticeText}` : `Page snippet: ${summarizeBody(checkInPageHtml)}`;

      throw new Error(
        `Check-in result page did not contain a recognized success message. ${responseHint}`,
      );
    }

    context.log(outcome.logMessage);

    return {
      providerId: ICE_PROVIDER_ID,
      providerName: ICE_PROVIDER_NAME,
      status: "success",
      message: `${outcome.resultMessage} Service message: ${outcome.noticeText}.`,
    };
  },
};

async function establishSignvSession({
  authToken,
  userId,
}: {
  authToken: string;
  userId: string;
}): Promise<SignvSession> {
  const embedUrl = createSignvEmbedUrl(userId, authToken);
  const { body, response } = await requestText(embedUrl, {
    method: "GET",
    headers: {
      Referer: ICE_SOURCE_HOST_URL,
    },
  });

  if (!response.ok) {
    throw new Error(buildSignvEmbedError(response, body));
  }

  const cookie = getSessionCookie(response.headers);

  return {
    cookie,
    initialPageHtml: body,
  };
}

function buildSignvEmbedError(response: Response, body: string): string {
  const summary = summarizeBody(body);

  if (response.status === 401 || response.status === 403) {
    return `Failed to establish the signv session because ICE_SUB2API_AUTH_TOKEN is invalid or expired, or ICE_SUB2API_USER_ID does not match the token. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  if (response.status === 400) {
    return `Failed to establish the signv session because the embed parameters were rejected. Check ICE_SUB2API_AUTH_TOKEN and ICE_SUB2API_USER_ID. HTTP 400 ${response.statusText}. Response: ${summary}`;
  }

  return `Initial signv embed request failed with ${response.status} ${response.statusText}: ${summary}`;
}

async function submitCheckIn(sessionCookie: string): Promise<string> {
  const checkInUrl = `${ICE_SIGNV_BASE_URL}${ICE_SIGNV_CHECKIN_PATH}`;
  const submitResponse = await requestText(checkInUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: sessionCookie,
      Origin: ICE_SIGNV_BASE_URL,
      Referer: `${ICE_SIGNV_BASE_URL}${ICE_SIGNV_EMBED_PATH}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });

  const updatedCookie = getSessionCookie(submitResponse.response.headers, sessionCookie);

  if (submitResponse.response.ok) {
    return submitResponse.body;
  }

  if (!isRedirectStatus(submitResponse.response.status)) {
    const bodySummary = summarizeBody(submitResponse.body);

    if (submitResponse.response.status === 401 || submitResponse.response.status === 403) {
      throw new Error(
        `Check-in submission was rejected because the signv session is invalid or expired. Re-copy ICE_SUB2API_AUTH_TOKEN from the browser and try again. HTTP ${submitResponse.response.status} ${submitResponse.response.statusText}. Response: ${bodySummary}`,
      );
    }

    throw new Error(
      `Check-in form submission failed with ${submitResponse.response.status} ${submitResponse.response.statusText}: ${bodySummary}`,
    );
  }

  const location = submitResponse.response.headers.get("location");

  if (!location) {
    throw new Error("Check-in form submission returned a redirect without a Location header.");
  }

  const resultUrl = new URL(location, ICE_SIGNV_BASE_URL).toString();
  const resultResponse = await requestText(resultUrl, {
    method: "GET",
    headers: {
      Cookie: updatedCookie,
      Referer: `${ICE_SIGNV_BASE_URL}${ICE_SIGNV_EMBED_PATH}`,
    },
  });

  if (!resultResponse.response.ok) {
    throw new Error(
      `Check-in result page request failed with ${resultResponse.response.status} ${resultResponse.response.statusText}: ${summarizeBody(resultResponse.body)}`,
    );
  }

  return resultResponse.body;
}

function createSignvEmbedUrl(userId: string, authToken: string): string {
  const url = new URL(`${ICE_SIGNV_BASE_URL}${ICE_SIGNV_EMBED_PATH}`);

  // The custom page embeds signv with these exact parameters. Reusing them lets
  // us bootstrap the signv session without browser automation.
  url.searchParams.set("user_id", userId);
  url.searchParams.set("token", authToken);
  url.searchParams.set("theme", "dark");
  url.searchParams.set("lang", "zh");
  url.searchParams.set("ui_mode", "embedded");
  url.searchParams.set("src_host", ICE_SOURCE_HOST_URL.replace(/\/$/, ""));
  url.searchParams.set("src_url", ICE_SOURCE_PAGE_URL);

  return url.toString();
}

function parseCheckInOutcome(html: string): CheckInOutcome | null {
  const noticeText = extractNoticeText(html);

  if (noticeText?.includes(CHECK_IN_SUCCESS_TEXT)) {
    return {
      logMessage: `The signv result page reported a successful daily check-in: ${noticeText}`,
      resultMessage: "Daily check-in succeeded.",
      noticeText,
    };
  }

  if (noticeText?.includes(CHECK_IN_ALREADY_DONE_TEXT)) {
    return {
      logMessage: `The signv result page reported that today's check-in was already completed: ${noticeText}`,
      resultMessage: "Daily check-in had already been completed today.",
      noticeText,
    };
  }

  return null;
}

function extractNoticeText(html: string): string | null {
  const noticeMatch = html.match(/<div[^>]*class="[^"]*notice[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (!noticeMatch) {
    return null;
  }

  const text = decodeHtmlEntities(stripHtmlTags(noticeMatch[1])).replace(/\s+/g, " ").trim();

  return text || null;
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function getSessionCookie(headers: Headers, fallback?: string): string {
  const cookieHeaders = getSetCookieHeaders(headers);

  for (const header of cookieHeaders) {
    const match = header.match(/(?:^|,\s*)(session=[^;]+)/i);

    if (match) {
      return match[1];
    }
  }

  if (fallback) {
    return fallback;
  }

  throw new Error(
    "The signv response did not include the expected session cookie. The auth token may be invalid, the user ID may be wrong, or the site may have changed its embed flow.",
  );
}

function getSetCookieHeaders(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof extendedHeaders.getSetCookie === "function") {
    return extendedHeaders.getSetCookie();
  }

  const header = headers.get("set-cookie");

  return header ? [header] : [];
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function requestText(url: string, init: RequestInit): Promise<TextResponse> {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(ICE_REQUEST_TIMEOUT_MS),
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
