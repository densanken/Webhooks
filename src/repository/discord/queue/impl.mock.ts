import { parseDiscordWebhookUrl } from "../../../util/discord/webhook-url.ts";
import { hashString } from "../../../util/crypto.ts";
import { WebhookRepositoryConflictError } from "../../error/impl.ts";
import type {
  ClaimDiscordWebhookMessageInput,
  DiscordQueueRepositoryInterface,
  EnqueueDiscordMessageInput,
  PendingDiscordWebhookMessagePage,
  QueuedDiscordMessageRecord,
  ScanDiscordWebhookQueueOptions,
  ScanPendingDiscordWebhookMessagePageOptions,
  UpdateQueuedDiscordMessageInput,
} from "./interface.ts";
import { createQueuedDiscordMessageRecord } from "./record.ts";

const DEFAULT_PROCESSING_LEASE_MS = 60_000;

export class MockDiscordQueueRepository
  implements DiscordQueueRepositoryInterface {
  constructor(private records: QueuedDiscordMessageRecord[] = []) {}

  async enqueueDiscordWebhookMessage(
    input: EnqueueDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord> {
    if (this.records.some((record) => record.id === input.id)) {
      throw new WebhookRepositoryConflictError(
        `Queued Discord message already exists: ${input.id}`,
      );
    }

    const createdAtDate = input.now ?? new Date();
    const webhookUrlSecret = await this.normalizeDiscordWebhookUrl(
      input.discordWebhookUrl,
    );
    const record = createQueuedDiscordMessageRecord({
      id: input.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      discordWebhookUrl: webhookUrlSecret.url,
      discordWebhookUrlHash: webhookUrlSecret.hash,
      body: input.body,
      createdAt: createdAtDate.toISOString(),
      updatedAt: createdAtDate.toISOString(),
      attempts: 0,
      status: "pending",
    });

    this.records = [...this.records, record];
    return record;
  }

  getDiscordWebhookMessage(
    id: string,
  ): Promise<QueuedDiscordMessageRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.id === id) ?? null,
    );
  }

  scanPendingDiscordWebhookMessages(
    options: ScanDiscordWebhookQueueOptions = {},
  ): Promise<QueuedDiscordMessageRecord[]> {
    const now = options.now ?? new Date();
    const records = this.records
      .filter((record) =>
        record.status === "pending" ||
        this.isExpiredProcessingMessage(record, now)
      )
      .sort((left, right) => this.compareQueueOrder(left, right));

    return Promise.resolve(records.slice(0, options.limit));
  }

  scanPendingDiscordWebhookMessagePage(
    options: ScanPendingDiscordWebhookMessagePageOptions,
  ): Promise<PendingDiscordWebhookMessagePage> {
    if (options.limit <= 0) {
      return Promise.resolve({ messages: [], scannedCount: 0 });
    }

    const now = options.now ?? new Date();
    const indexedRecords = this.records
      .filter((record) =>
        record.status === "pending" || record.status === "processing"
      )
      .sort((left, right) => this.compareQueueOrder(left, right));
    const startIndex = options.cursor === undefined
      ? 0
      : indexedRecords.findIndex((record) =>
        this.toQueueCursor(record) > options.cursor!
      );
    if (startIndex < 0) {
      return Promise.resolve({ messages: [], scannedCount: 0 });
    }

    const scannedRecords = indexedRecords.slice(
      startIndex,
      startIndex + options.limit,
    );
    const messages = scannedRecords.filter((record) =>
      record.status === "pending" ||
      this.isExpiredProcessingMessage(record, now)
    );
    const lastRecord = scannedRecords.at(-1);

    return Promise.resolve({
      messages,
      scannedCount: scannedRecords.length,
      ...(scannedRecords.length < options.limit || lastRecord === undefined
        ? {}
        : { cursor: this.toQueueCursor(lastRecord) }),
    });
  }

  async claimDiscordWebhookMessage(
    id: string,
    input: ClaimDiscordWebhookMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null> {
    const record = await this.getDiscordWebhookMessage(id);
    if (record === null) return null;

    const now = input.now ?? new Date();
    if (
      record.status !== "pending" &&
      !this.isExpiredProcessingMessage(record, now)
    ) {
      return null;
    }

    const updatedRecord = createQueuedDiscordMessageRecord({
      ...record,
      claimId: input.claimId,
      status: "processing",
      processingUntilEpochMs: now.getTime() +
        Math.max(1, input.leaseMs ?? DEFAULT_PROCESSING_LEASE_MS),
      updatedAt: now.toISOString(),
    });
    this.replaceRecord(updatedRecord);

    return updatedRecord;
  }

  markDiscordWebhookMessageSent(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    return this.updateTerminalStatus(id, "sent", input);
  }

  moveDiscordWebhookMessageToDeadLetter(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    return this.updateTerminalStatus(id, "dead", input);
  }

  async recordDiscordWebhookMessageFailure(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    const record = await this.getDiscordWebhookMessage(id);
    if (record === null) return null;
    if (!this.isRetryableStatus(record.status)) return null;
    if (!this.matchesClaim(record, input.claimId)) return null;

    const updatedRecord = createQueuedDiscordMessageRecord({
      ...record,
      attempts: input.incrementAttempts === false
        ? record.attempts
        : record.attempts + 1,
      claimId: undefined,
      lastError: input.lastError,
      processingUntilEpochMs: undefined,
      status: "pending",
      updatedAt: (input.now ?? new Date()).toISOString(),
    });
    this.replaceRecord(updatedRecord);

    return updatedRecord;
  }

  listDeadDiscordWebhookMessages(
    options: ScanDiscordWebhookQueueOptions = {},
  ): Promise<QueuedDiscordMessageRecord[]> {
    const records = this.records
      .filter((record) => record.status === "dead")
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

    return Promise.resolve(records.slice(0, options.limit));
  }

  private async updateTerminalStatus(
    id: string,
    status: "sent" | "dead",
    input: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null> {
    const record = await this.getDiscordWebhookMessage(id);
    if (record === null) return null;
    if (!this.isRetryableStatus(record.status)) return null;
    if (!this.matchesClaim(record, input.claimId)) return null;

    const updatedRecord = createQueuedDiscordMessageRecord({
      ...record,
      attempts: input.incrementAttempts ? record.attempts + 1 : record.attempts,
      claimId: undefined,
      lastError: input.lastError,
      processingUntilEpochMs: undefined,
      status,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });
    this.replaceRecord(updatedRecord);

    return updatedRecord;
  }

  private replaceRecord(updatedRecord: QueuedDiscordMessageRecord): void {
    this.records = this.records.map((record) =>
      record.id === updatedRecord.id ? updatedRecord : record
    );
  }

  private isRetryableStatus(status: string): boolean {
    return status === "pending" || status === "processing";
  }

  private matchesClaim(
    message: QueuedDiscordMessageRecord,
    claimId: string | undefined,
  ): boolean {
    if (claimId === undefined) return message.status !== "processing";
    return message.status === "processing" && message.claimId === claimId;
  }

  private isExpiredProcessingMessage(
    message: QueuedDiscordMessageRecord,
    now: Date,
  ): boolean {
    return message.status === "processing" &&
      (message.processingUntilEpochMs ?? 0) <= now.getTime();
  }

  private compareQueueOrder(
    left: QueuedDiscordMessageRecord,
    right: QueuedDiscordMessageRecord,
  ): number {
    return this.toQueueCursor(left).localeCompare(this.toQueueCursor(right));
  }

  private toQueueCursor(message: QueuedDiscordMessageRecord): string {
    return `${message.createdAt} ${message.id}`;
  }

  private async normalizeDiscordWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<{ url: string; hash: string }> {
    const parsedUrl = parseDiscordWebhookUrl(discordWebhookUrl);

    return {
      url: parsedUrl.url,
      hash: await hashString(parsedUrl.url),
    };
  }
}
