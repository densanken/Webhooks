import type { EncryptedString } from "../../../util/crypto.ts";
import type {
  QueuedDiscordMessageError,
  QueuedDiscordMessageErrorReason,
  QueuedDiscordMessageRecord,
} from "./interface.ts";

export type QueuedDiscordMessageKvRecord =
  & Omit<QueuedDiscordMessageRecord, "discordWebhookUrl">
  & {
    encryptedDiscordWebhookUrl: EncryptedString;
  };

export const createQueuedDiscordMessageRecord = (
  input: QueuedDiscordMessageRecord,
): QueuedDiscordMessageRecord => ({
  id: input.id,
  sourceType: input.sourceType,
  sourceId: input.sourceId,
  discordWebhookUrl: input.discordWebhookUrl,
  discordWebhookUrlHash: input.discordWebhookUrlHash,
  body: input.body,
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
  attempts: input.attempts,
  claimId: input.claimId,
  processingUntilEpochMs: input.processingUntilEpochMs,
  lastError: input.lastError !== undefined
    ? createQueuedDiscordMessageError(input.lastError)
    : undefined,
  status: input.status,
});

export const createQueuedDiscordMessageKvRecord = (
  input: QueuedDiscordMessageKvRecord,
): QueuedDiscordMessageKvRecord => ({
  id: input.id,
  sourceType: input.sourceType,
  sourceId: input.sourceId,
  encryptedDiscordWebhookUrl: input.encryptedDiscordWebhookUrl,
  discordWebhookUrlHash: input.discordWebhookUrlHash,
  body: input.body,
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
  attempts: input.attempts,
  claimId: input.claimId,
  processingUntilEpochMs: input.processingUntilEpochMs,
  lastError: input.lastError !== undefined
    ? createQueuedDiscordMessageError(input.lastError)
    : undefined,
  status: input.status,
});

export const toQueuedDiscordMessageRecord = (
  input: {
    record: QueuedDiscordMessageKvRecord;
    discordWebhookUrl: string;
  },
): QueuedDiscordMessageRecord =>
  createQueuedDiscordMessageRecord({
    id: input.record.id,
    sourceType: input.record.sourceType,
    sourceId: input.record.sourceId,
    discordWebhookUrl: input.discordWebhookUrl,
    discordWebhookUrlHash: input.record.discordWebhookUrlHash,
    body: input.record.body,
    createdAt: input.record.createdAt,
    updatedAt: input.record.updatedAt,
    attempts: input.record.attempts,
    claimId: input.record.claimId,
    processingUntilEpochMs: input.record.processingUntilEpochMs,
    lastError: input.record.lastError,
    status: input.record.status,
  });

const QUEUED_DISCORD_MESSAGE_ERROR_REASONS = new Set<
  QueuedDiscordMessageErrorReason
>([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "network_error",
  "server_error",
  "max_attempts_exceeded",
  "unknown",
]);

const createQueuedDiscordMessageError = (
  input: QueuedDiscordMessageError,
): QueuedDiscordMessageError => {
  const reason = QUEUED_DISCORD_MESSAGE_ERROR_REASONS.has(input.reason)
    ? input.reason
    : "unknown";
  const upstreamStatus = Number.isInteger(input.upstreamStatus)
    ? input.upstreamStatus
    : undefined;

  return {
    reason,
    upstreamStatus,
  };
};
