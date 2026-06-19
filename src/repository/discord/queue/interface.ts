export type QueuedDiscordMessageSourceType =
  | "registered"
  | "dynamic"
  | "system";

export type QueuedDiscordMessageStatus =
  | "pending"
  | "processing"
  | "sent"
  | "dead";

export type QueuedDiscordMessageErrorReason =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "max_attempts_exceeded"
  | "unknown";

export type QueuedDiscordMessageError = {
  reason: QueuedDiscordMessageErrorReason;
  upstreamStatus?: number;
};

export type QueuedDiscordMessageRecord = {
  id: string;
  sourceType: QueuedDiscordMessageSourceType;
  sourceId: string;
  discordWebhookUrl: string;
  discordWebhookUrlHash: string;
  body: unknown;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  claimId?: string;
  processingUntilEpochMs?: number;
  lastError?: QueuedDiscordMessageError;
  status: QueuedDiscordMessageStatus;
};

export type PendingQueueIndex = {
  messageId: string;
};

export type DeadQueueIndex = {
  messageId: string;
};

export type EnqueueDiscordMessageInput = {
  id: string;
  sourceType: QueuedDiscordMessageSourceType;
  sourceId: string;
  discordWebhookUrl: string;
  body: unknown;
  now?: Date;
};

export type UpdateQueuedDiscordMessageInput = {
  claimId?: string;
  incrementAttempts?: boolean;
  lastError?: QueuedDiscordMessageError;
  now?: Date;
};

export type ClaimDiscordWebhookMessageInput = {
  claimId: string;
  now?: Date;
  leaseMs?: number;
};

export type ScanDiscordWebhookQueueOptions = {
  limit?: number;
  now?: Date;
};

export type ScanPendingDiscordWebhookMessagePageOptions = {
  cursor?: string;
  limit: number;
  now?: Date;
};

export type PendingDiscordWebhookMessagePage = {
  messages: QueuedDiscordMessageRecord[];
  scannedCount: number;
  cursor?: string;
};

export interface DiscordQueueRepositoryInterface {
  enqueueDiscordWebhookMessage(
    input: EnqueueDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord>;
  getDiscordWebhookMessage(
    id: string,
  ): Promise<QueuedDiscordMessageRecord | null>;
  scanPendingDiscordWebhookMessages(
    options?: ScanDiscordWebhookQueueOptions,
  ): Promise<QueuedDiscordMessageRecord[]>;
  scanPendingDiscordWebhookMessagePage(
    options: ScanPendingDiscordWebhookMessagePageOptions,
  ): Promise<PendingDiscordWebhookMessagePage>;
  claimDiscordWebhookMessage(
    id: string,
    input: ClaimDiscordWebhookMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null>;
  markDiscordWebhookMessageSent(
    id: string,
    input?: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null>;
  moveDiscordWebhookMessageToDeadLetter(
    id: string,
    input?: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null>;
  recordDiscordWebhookMessageFailure(
    id: string,
    input?: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null>;
  listDeadDiscordWebhookMessages(
    options?: ScanDiscordWebhookQueueOptions,
  ): Promise<QueuedDiscordMessageRecord[]>;
}
