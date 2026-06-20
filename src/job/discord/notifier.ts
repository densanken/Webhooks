import type { DiscordQueueRepositoryInterface } from "../../repository/discord/queue/interface.ts";
import type { DiscordRateLimitRepositoryInterface } from "../../repository/discord/rate-limit/interface.ts";
import type { DiscordSender } from "../../usecase/discord/sender/interface.ts";
import type { DeadMessageSummary } from "../../usecase/discord/dispatch/interface.ts";
import {
  isActiveRateLimit,
  toBlockedUntilEpochMs,
  toSafeRetryAfterMs,
} from "../../util/discord/rate-limit.ts";

export type DeadLetterNotifierDependencies = {
  notificationWebhookUrl: string;
  queueRepository: DiscordQueueRepositoryInterface;
  rateLimitRepository: DiscordRateLimitRepositoryInterface;
  sender: DiscordSender;
  generateMessageId?: () => string;
  getNow?: () => Date;
};

// Discord の埋め込み説明文は最大 4096 文字
const EMBED_DESCRIPTION_MAX_LENGTH = 4096;

const TERMINAL_NOTIFICATION_FAILURE_REASONS = new Set([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
]);

const buildBodyCodeBlock = (body: unknown): string => {
  let json: string;
  try {
    json = JSON.stringify(body, null, 2);
  } catch {
    json = String(body);
  }

  const prefix = "```json\n";
  const suffix = "\n```";
  const maxJsonLength = EMBED_DESCRIPTION_MAX_LENGTH - prefix.length -
    suffix.length - 100;

  if (json.length > maxJsonLength) {
    json = json.slice(0, maxJsonLength - 3) + "...";
  }

  return `${prefix}${json}${suffix}`;
};

const formatSourceType = (sourceType: string): string => {
  if (sourceType === "registered" || sourceType === "dynamic") {
    return `Discord (${sourceType})`;
  }
  return sourceType;
};

const buildNotificationBody = (message: DeadMessageSummary): unknown => {
  const errorValue = message.lastError
    ? `${message.lastError.reason}${
      message.lastError.upstreamStatus !== undefined
        ? ` (HTTP ${message.lastError.upstreamStatus})`
        : ""
    }`
    : "unknown";

  return {
    embeds: [{
      title: "Dead Letter Alert",
      color: 0xed4245,
      description: buildBodyCodeBlock(message.body),
      fields: [
        { name: "Queue Message ID", value: message.id, inline: false },
        {
          name: "Source",
          value: `${
            formatSourceType(message.sourceType)
          } / ${message.sourceId}`,
          inline: true,
        },
        { name: "Attempts", value: String(message.attempts), inline: true },
        { name: "Error", value: errorValue, inline: true },
      ],
    }],
  };
};

const enqueueNotification = async (
  body: unknown,
  deps: DeadLetterNotifierDependencies,
  now: Date,
): Promise<void> => {
  await deps.queueRepository.enqueueDiscordWebhookMessage({
    id: deps.generateMessageId?.() ?? crypto.randomUUID(),
    sourceType: "system",
    sourceId: "dead-letter-notifier",
    discordWebhookUrl: deps.notificationWebhookUrl,
    body,
    now,
  });
};

export const notifyDeadLetterMessages = async (
  messages: DeadMessageSummary[],
  deps: DeadLetterNotifierDependencies,
): Promise<void> => {
  if (messages.length === 0) return;

  const now = deps.getNow?.() ?? new Date();

  const rateLimit = await deps.rateLimitRepository
    .getDiscordUrlRateLimitForWebhookUrl(deps.notificationWebhookUrl);
  if (
    rateLimit !== null && isActiveRateLimit(rateLimit.blockedUntilEpochMs, now)
  ) {
    for (const message of messages) {
      await enqueueNotification(buildNotificationBody(message), deps, now);
    }
    return;
  }

  for (let i = 0; i < messages.length; i++) {
    const body = buildNotificationBody(messages[i]);

    let result;
    try {
      result = await deps.sender.sendDiscordWebhook({
        discordWebhookUrl: deps.notificationWebhookUrl,
        body,
      });
    } catch {
      await enqueueNotification(body, deps, now);
      continue;
    }

    if (result.ok) continue;

    if (result.reason === "rate_limited") {
      const retryAfterMs = toSafeRetryAfterMs(result.retryAfterMs);
      const blockedUntilEpochMs = toBlockedUntilEpochMs(
        now,
        retryAfterMs,
        result.blockedUntilEpochMs,
      );
      await deps.rateLimitRepository.setDiscordUrlRateLimitForWebhookUrl({
        discordWebhookUrl: deps.notificationWebhookUrl,
        blockedUntilEpochMs,
        retryAfterMs,
        scope: result.scope,
        bucket: result.bucket,
        now,
      });
      for (let j = i; j < messages.length; j++) {
        await enqueueNotification(
          buildNotificationBody(messages[j]),
          deps,
          now,
        );
      }
      return;
    }

    if (!TERMINAL_NOTIFICATION_FAILURE_REASONS.has(result.reason)) {
      // リトライ可能なエラー (5xx, network_error, unknown) は後で送信するためにキューに入れる
      await enqueueNotification(body, deps, now);
    }
    // これ以上リトライしない 4xx は何もせずスキップする
  }
};
