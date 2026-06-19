import type { QueuedDiscordMessageError } from "../../../repository/discord/queue/interface.ts";
import type { DiscordSendResult } from "../sender/interface.ts";

export {
  isActiveRateLimit,
  toBlockedUntilEpochMs,
  toSafeRetryAfterMs,
} from "../../../util/discord/rate-limit.ts";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_DISPATCH_LIMIT = 50;
export const DEFAULT_DISPATCH_SCAN_PAGE_SIZE = 50;
export const DEFAULT_DISPATCH_MAX_SCAN_PAGES = 10;
export const DEFAULT_SEND_INTERVAL_MS = 1_000;
export const DEFAULT_SEND_RESERVATION_MS = 60_000;

const TERMINAL_FAILURE_REASONS = new Set([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
]);

export const isTerminalFailure = (
  result: Extract<DiscordSendResult, { ok: false }>,
): boolean => TERMINAL_FAILURE_REASONS.has(result.reason);

export const toQueuedDiscordMessageError = (
  result: Extract<DiscordSendResult, { ok: false }>,
): QueuedDiscordMessageError => ({
  reason: result.reason,
  ...(result.upstreamStatus === undefined ? {} : {
    upstreamStatus: result.upstreamStatus,
  }),
});
