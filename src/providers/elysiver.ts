import type { CheckInProvider } from "../core/types.js";

const ELYSIVER_PROVIDER_ID = "elysiver";
const ELYSIVER_PROVIDER_NAME = "elysiver.h-e.top";
const ELYSIVER_BASE_URL = "https://elysiver.h-e.top";
const ELYSIVER_SELF_PATH = "/api/user/self";
const ELYSIVER_CHECKIN_PATH = "/api/user/checkin";
const ELYSIVER_COOKIE_ENV = "ELYSIVER_COOKIE";
const ELYSIVER_USER_ID_ENV = "ELYSIVER_USER_ID";
const ELYSIVER_REQUEST_TIMEOUT_MS = 15_000;
const ELYSIVER_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const ELYSIVER_SITE_TIME_ZONE = "Asia/Shanghai";
const CHECK_IN_SUCCESS_TEXT = "签到成功";
const CHECK_IN_ALREADY_DONE_TEXT = "今日已签到";

interface JsonResponse {
  body: string;
  response: Response;
}

interface ElysiverApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

interface ElysiverUserData {
  id?: number | string;
  username?: string;
}

type ElysiverUserSelfResponse = ElysiverApiEnvelope<ElysiverUserData>;

interface ElysiverCheckInActionData {
  checkin_date?: string;
  quota_awarded?: number | string;
}

type ElysiverCheckInActionResponse = ElysiverApiEnvelope<ElysiverCheckInActionData>;

interface ElysiverCheckInRecord {
  checkin_date?: string;
  quota_awarded?: number | string;
}

interface ElysiverCheckInStats {
  checked_in_today?: boolean;
  checkin_count?: number;
  records?: ElysiverCheckInRecord[];
  total_checkins?: number;
  total_quota?: number | string;
}

interface ElysiverCheckInMonthData {
  enabled?: boolean;
  fixed_quota?: number | string;
  max_quota?: number | string;
  min_quota?: number | string;
  random_mode?: boolean;
  stats?: ElysiverCheckInStats;
}

type ElysiverCheckInMonthResponse = ElysiverApiEnvelope<ElysiverCheckInMonthData>;

interface ShanghaiDateParts {
  dateKey: string;
  monthKey: string;
}

export const elysiverProvider: CheckInProvider = {
  id: ELYSIVER_PROVIDER_ID,
  displayName: ELYSIVER_PROVIDER_NAME,
  requiredEnv: [ELYSIVER_COOKIE_ENV, ELYSIVER_USER_ID_ENV],
  async run(context) {
    // Keep the dry-run output explicit so users can confirm that the provider now
    // performs a real check-in flow instead of auth-only probing.
    if (context.dryRun) {
      context.log("Dry-run mode is enabled. No request is sent to elysiver.h-e.top.");

      return {
        providerId: ELYSIVER_PROVIDER_ID,
        providerName: ELYSIVER_PROVIDER_NAME,
        status: "skip",
        message:
          "Dry-run would verify the restored cookie-based login state, inspect the current monthly check-in stats, and submit the /api/user/checkin request when today's check-in is still pending.",
      };
    }

    const cookieHeader = normalizeCookieHeader(context.env[ELYSIVER_COOKIE_ENV]);
    const expectedUserId = context.env[ELYSIVER_USER_ID_ENV]?.trim();

    if (!cookieHeader || !expectedUserId) {
      throw new Error(
        `Missing required environment variables: ${[ELYSIVER_COOKIE_ENV, ELYSIVER_USER_ID_ENV].join(", ")}`,
      );
    }

    // Keep the input format convenient for the user: they can paste the full
    // browser Cookie string into ELYSIVER_COOKIE. For GitHub automation we only
    // forward the application session cookie for now, while keeping the full
    // input shape available in case cf_clearance needs to be re-enabled later.
    const applicationCookieHeader = buildApplicationCookieHeader(cookieHeader);

    context.log("Verifying the restored cookie-based login state through /api/user/self.");
    const userSelf = await requestUserSelf(applicationCookieHeader, expectedUserId);
    const actualUserId = extractUserId(userSelf);

    if (!actualUserId) {
      throw new Error(
        `The NewAPI user-self response did not contain a recognizable user id. Response: ${summarizeBody(userSelf)}`,
      );
    }

    if (actualUserId !== expectedUserId) {
      throw new Error(
        `The restored login belongs to user ${actualUserId}, but ELYSIVER_USER_ID is ${expectedUserId}. Response: ${summarizeBody(userSelf)}`,
      );
    }

    const username = extractUsername(userSelf);
    const dateParts = getShanghaiDateParts();

    // The browser refreshes the month-scoped check-in stats after a successful
    // click. Reusing the same API gives us a server-side equivalent of the UI's
    // disabled "今日已签到" state without needing browser automation.
    context.log(`Loading the current monthly check-in stats for ${dateParts.monthKey}.`);
    const monthStatsBefore = await requestCheckInMonth(applicationCookieHeader, expectedUserId, dateParts.monthKey);
    const todayRecordBefore = findTodayRecord(monthStatsBefore, dateParts.dateKey);

    if (isCheckedInToday(monthStatsBefore)) {
      context.log("The monthly stats already report that today's check-in is completed.");

      return {
        providerId: ELYSIVER_PROVIDER_ID,
        providerName: ELYSIVER_PROVIDER_NAME,
        status: "success",
        message: buildAlreadyDoneMessage({
          userId: actualUserId,
          username,
          serviceMessage: CHECK_IN_ALREADY_DONE_TEXT,
          todayRecord: todayRecordBefore,
        }),
      };
    }

    context.log("Submitting the daily check-in request.");
    const checkInAction = await submitCheckIn(applicationCookieHeader, expectedUserId);
    const serviceMessage = normalizeOptionalString(checkInAction.message);

    context.log(`Reloading the monthly check-in stats for ${dateParts.monthKey}.`);
    const monthStatsAfter = await requestCheckInMonth(applicationCookieHeader, expectedUserId, dateParts.monthKey);
    const todayRecordAfter = findTodayRecord(monthStatsAfter, dateParts.dateKey);

    if (checkInAction.success === false) {
      if (isCheckedInToday(monthStatsAfter) || looksLikeAlreadyDone(serviceMessage)) {
        context.log("The check-in endpoint did not report success, but the monthly stats confirm that today's check-in is completed.");

        return {
          providerId: ELYSIVER_PROVIDER_ID,
          providerName: ELYSIVER_PROVIDER_NAME,
          status: "success",
          message: buildAlreadyDoneMessage({
            userId: actualUserId,
            username,
            serviceMessage,
            todayRecord: todayRecordAfter,
          }),
        };
      }

      throw new Error(buildCheckInBusinessError(checkInAction));
    }

    if (!isCheckedInToday(monthStatsAfter) && !looksLikeSuccess(serviceMessage)) {
      context.log(
        "The follow-up month stats did not confirm today's check-in immediately. Trusting the successful POST response.",
      );
    }

    return {
      providerId: ELYSIVER_PROVIDER_ID,
      providerName: ELYSIVER_PROVIDER_NAME,
      status: "success",
      message: buildSuccessMessage({
        userId: actualUserId,
        username,
        serviceMessage,
        checkInDate: normalizeOptionalString(checkInAction.data?.checkin_date),
        quotaAwarded: checkInAction.data?.quota_awarded ?? todayRecordAfter?.quota_awarded,
      }),
    };
  },
};

async function requestUserSelf(
  cookieHeader: string,
  expectedUserId: string,
): Promise<ElysiverUserSelfResponse> {
  const result = await requestJson(`${ELYSIVER_BASE_URL}${ELYSIVER_SELF_PATH}`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      "New-API-User": expectedUserId,
      Referer: `${ELYSIVER_BASE_URL}/console`,
    },
  });

  if (!result.response.ok) {
    throw new Error(buildAuthVerificationError(result.response, result.body));
  }

  const payload = parseJsonBody<ElysiverUserSelfResponse>(result.body, "/api/user/self");

  if (payload.success === false) {
    const message = normalizeOptionalString(payload.message);
    throw new Error(
      `The NewAPI user-self response reported success=false.${message ? ` Service message: ${message}.` : ""} Response: ${summarizeBody(payload)}`,
    );
  }

  return payload;
}

async function requestCheckInMonth(
  cookieHeader: string,
  expectedUserId: string,
  monthKey: string,
): Promise<ElysiverCheckInMonthResponse> {
  const url = new URL(`${ELYSIVER_BASE_URL}${ELYSIVER_CHECKIN_PATH}`);
  url.searchParams.set("month", monthKey);

  const result = await requestJson(url.toString(), {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      "New-API-User": expectedUserId,
      Referer: `${ELYSIVER_BASE_URL}/console/personal`,
    },
  });

  if (!result.response.ok) {
    throw new Error(buildMonthStatsError(result.response, result.body));
  }

  const payload = parseJsonBody<ElysiverCheckInMonthResponse>(result.body, "/api/user/checkin?month=YYYY-MM");

  if (payload.success === false) {
    const message = normalizeOptionalString(payload.message);
    throw new Error(
      `The monthly check-in stats response reported success=false.${message ? ` Service message: ${message}.` : ""} Response: ${summarizeBody(payload)}`,
    );
  }

  return payload;
}

async function submitCheckIn(
  cookieHeader: string,
  expectedUserId: string,
): Promise<ElysiverCheckInActionResponse> {
  const result = await requestJson(`${ELYSIVER_BASE_URL}${ELYSIVER_CHECKIN_PATH}`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "New-API-User": expectedUserId,
      Origin: ELYSIVER_BASE_URL,
      Referer: `${ELYSIVER_BASE_URL}/console/personal`,
    },
    body: "",
  });

  if (!result.response.ok) {
    throw new Error(buildCheckInRequestError(result.response, result.body));
  }

  return parseJsonBody<ElysiverCheckInActionResponse>(result.body, "/api/user/checkin");
}

function normalizeCookieHeader(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("; ");

  return normalized || null;
}

function buildApplicationCookieHeader(cookieHeader: string): string {
  const sessionCookie = getCookieValue(cookieHeader, "session");

  if (!sessionCookie) {
    throw new Error(
      "ELYSIVER_COOKIE does not contain a session cookie. Provide the full browser Cookie string, including session=....",
    );
  }

  return `session=${sessionCookie}`;
}

function getCookieValue(cookieHeader: string, cookieName: string): string | null {
  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const [namePart, ...valueParts] = segment.split("=");
    const normalizedName = namePart?.trim();

    if (normalizedName !== cookieName) {
      continue;
    }

    const value = valueParts.join("=").trim();

    return value || null;
  }

  return null;
}

function buildAuthVerificationError(response: Response, body: string): string {
  const summary = summarizeBody(body);

  if (response.status === 403 && looksLikeCloudflareChallenge(body)) {
    return `The restored login verification appears to have been blocked by a Cloudflare challenge before the request reached the NewAPI application. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  if (response.status === 401 || response.status === 403) {
    return `Failed to verify the restored login because ELYSIVER_COOKIE is invalid or expired, ELYSIVER_USER_ID does not match the session, or the site requires fresher cookies. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  return `The NewAPI user-self request failed with ${response.status} ${response.statusText}: ${summary}`;
}

function buildMonthStatsError(response: Response, body: string): string {
  const summary = summarizeBody(body);

  if (response.status === 403 && looksLikeCloudflareChallenge(body)) {
    return `Loading the monthly check-in stats appears to have been blocked by a Cloudflare challenge before the request reached the NewAPI application. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  if (response.status === 401 || response.status === 403) {
    return `Failed to load the monthly check-in stats because ELYSIVER_COOKIE is invalid or expired, or ELYSIVER_USER_ID does not match the session. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  return `The monthly check-in stats request failed with ${response.status} ${response.statusText}: ${summary}`;
}

function buildCheckInRequestError(response: Response, body: string): string {
  const summary = summarizeBody(body);

  if (response.status === 403 && looksLikeCloudflareChallenge(body)) {
    return `The daily check-in request appears to have been blocked by a Cloudflare challenge before the request reached the NewAPI application. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  if (response.status === 401 || response.status === 403) {
    return `The daily check-in request was rejected because ELYSIVER_COOKIE is invalid or expired, or ELYSIVER_USER_ID does not match the session. HTTP ${response.status} ${response.statusText}. Response: ${summary}`;
  }

  return `The daily check-in request failed with ${response.status} ${response.statusText}: ${summary}`;
}

function looksLikeCloudflareChallenge(body: string): boolean {
  return /Just a moment/i.test(body) || /cf-browser-verification/i.test(body) || /cloudflare/i.test(body);
}

function buildCheckInBusinessError(payload: ElysiverCheckInActionResponse): string {
  const message = normalizeOptionalString(payload.message);

  return `The daily check-in endpoint did not report success.${message ? ` Service message: ${message}.` : ""} Response: ${summarizeBody(payload)}`;
}

function parseJsonBody<T>(body: string, endpointName: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      `The ${endpointName} response did not return valid JSON. Response: ${summarizeBody(body)}`,
    );
  }
}

function extractUserId(payload: ElysiverUserSelfResponse): string | null {
  const rawId = payload.data?.id;

  if (rawId === undefined || rawId === null) {
    return null;
  }

  const normalized = String(rawId).trim();

  return normalized || null;
}

function extractUsername(payload: ElysiverUserSelfResponse): string | null {
  const rawUsername = payload.data?.username;

  if (typeof rawUsername !== "string") {
    return null;
  }

  const normalized = rawUsername.trim();

  return normalized || null;
}

function isCheckedInToday(payload: ElysiverCheckInMonthResponse): boolean {
  return payload.data?.stats?.checked_in_today === true;
}

function findTodayRecord(
  payload: ElysiverCheckInMonthResponse,
  dateKey: string,
): ElysiverCheckInRecord | null {
  const records = payload.data?.stats?.records;

  if (!records?.length) {
    return null;
  }

  for (const record of records) {
    if (normalizeOptionalString(record.checkin_date) === dateKey) {
      return record;
    }
  }

  return null;
}

function looksLikeSuccess(message: string | null): boolean {
  return !!message?.includes(CHECK_IN_SUCCESS_TEXT);
}

function looksLikeAlreadyDone(message: string | null): boolean {
  return !!message?.includes(CHECK_IN_ALREADY_DONE_TEXT) || !!message?.includes("已签到");
}

function buildSuccessMessage({
  userId,
  username,
  serviceMessage,
  checkInDate,
  quotaAwarded,
}: {
  userId: string;
  username: string | null;
  serviceMessage: string | null;
  checkInDate: string | null;
  quotaAwarded: number | string | undefined;
}): string {
  const parts = [`Daily check-in succeeded for user ${userId}.`];

  if (username) {
    parts.push(`Username: ${username}.`);
  }

  if (serviceMessage) {
    parts.push(`Service message: ${serviceMessage}.`);
  }

  if (checkInDate) {
    parts.push(`Check-in date: ${checkInDate}.`);
  }

  const formattedQuota = formatQuota(quotaAwarded);

  if (formattedQuota) {
    parts.push(`Quota awarded: ${formattedQuota}.`);
  }

  return parts.join(" ");
}

function buildAlreadyDoneMessage({
  userId,
  username,
  serviceMessage,
  todayRecord,
}: {
  userId: string;
  username: string | null;
  serviceMessage: string | null;
  todayRecord: ElysiverCheckInRecord | null;
}): string {
  const parts = [`Daily check-in had already been completed today for user ${userId}.`];

  if (username) {
    parts.push(`Username: ${username}.`);
  }

  if (serviceMessage) {
    parts.push(`Service message: ${serviceMessage}.`);
  }

  const checkInDate = normalizeOptionalString(todayRecord?.checkin_date);

  if (checkInDate) {
    parts.push(`Check-in date: ${checkInDate}.`);
  }

  const formattedQuota = formatQuota(todayRecord?.quota_awarded);

  if (formattedQuota) {
    parts.push(`Quota awarded: ${formattedQuota}.`);
  }

  return parts.join(" ");
}

function getShanghaiDateParts(): ShanghaiDateParts {
  // The GitHub Actions runner uses UTC, but this project schedules the workflow
  // around Asia/Shanghai midnight. Formatting in that timezone keeps the month
  // query aligned with the site's current day even at UTC month boundaries.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ELYSIVER_SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format the current Asia/Shanghai date for elysiver check-in.");
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function formatQuota(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  return null;
}

async function requestJson(url: string, init: RequestInit): Promise<JsonResponse> {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/plain, */*");
  }

  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7");
  }

  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }

  if (!headers.has("Pragma")) {
    headers.set("Pragma", "no-cache");
  }

  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", ELYSIVER_DEFAULT_USER_AGENT);
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
