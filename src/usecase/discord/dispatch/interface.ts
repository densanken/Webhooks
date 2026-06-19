export type DispatchPendingInput = {
  limit?: number;
  maxAttempts?: number;
  processingLeaseMs?: number;
  sendIntervalMs?: number;
  now?: Date;
};

export type DeadMessageSummary = {
  id: string;
  sourceType: string;
  sourceId: string;
  attempts: number;
  lastError?: { reason: string; upstreamStatus?: number };
  body: unknown;
};

export type DispatchPendingResult = {
  scanned: number;
  sent: number;
  skipped: number;
  retried: number;
  rateLimited: number;
  dead: number;
  deadMessages: DeadMessageSummary[];
};

export interface DiscordDispatchUseCaseInterface {
  dispatchPendingDiscordWebhookMessages(
    input?: DispatchPendingInput,
  ): Promise<DispatchPendingResult>;
}
