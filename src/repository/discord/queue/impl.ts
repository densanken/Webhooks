import {
  deadQueueIndexKey,
  deadQueueIndexPrefix,
  pendingQueueIndexKey,
  pendingQueueIndexPrefix,
  queueMessageKey,
} from "../../../infrastructure/kv/discord-key.ts";
import {
  normalizeAndEncryptDiscordWebhookUrl,
  queueDiscordWebhookUrlLabel,
} from "../../../infrastructure/discord-webhook-secret.ts";
import { WebhookRepositoryConflictError } from "../../error/impl.ts";
import type {
  ClaimDiscordWebhookMessageInput,
  DeadQueueIndex,
  DiscordQueueRepositoryInterface,
  EnqueueDiscordMessageInput,
  PendingDiscordWebhookMessagePage,
  PendingQueueIndex,
  QueuedDiscordMessageRecord,
  ScanDiscordWebhookQueueOptions,
  ScanPendingDiscordWebhookMessagePageOptions,
  UpdateQueuedDiscordMessageInput,
} from "./interface.ts";
import {
  createQueuedDiscordMessageKvRecord,
  type QueuedDiscordMessageKvRecord,
  toQueuedDiscordMessageRecord,
} from "./record.ts";
import { decryptQueuedDiscordWebhookUrl } from "./secret.ts";

const DEFAULT_PROCESSING_LEASE_MS = 60_000;

export class DiscordQueueRepository implements DiscordQueueRepositoryInterface {
  constructor(private readonly kv: Deno.Kv) {}

  async enqueueDiscordWebhookMessage(
    input: EnqueueDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord> {
    const createdAtDate = input.now ?? new Date();
    const createdAt = createdAtDate.toISOString();
    const createdAtEpochMs = createdAtDate.getTime();
    const messageKey = queueMessageKey(input.id);
    const pendingIndexKey = pendingQueueIndexKey(createdAtEpochMs, input.id);
    const webhookUrlSecret = await normalizeAndEncryptDiscordWebhookUrl(
      queueDiscordWebhookUrlLabel(input.id),
      input.discordWebhookUrl,
    );
    const record = createQueuedDiscordMessageKvRecord({
      id: input.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      encryptedDiscordWebhookUrl: webhookUrlSecret.encryptedUrl,
      discordWebhookUrlHash: webhookUrlSecret.hash,
      body: input.body,
      createdAt,
      updatedAt: createdAt,
      attempts: 0,
      status: "pending",
    });
    const pendingIndex: PendingQueueIndex = { messageId: input.id };

    const result = await this.kv.atomic()
      .check({ key: messageKey, versionstamp: null })
      .check({ key: pendingIndexKey, versionstamp: null })
      .set(messageKey, record)
      .set(pendingIndexKey, pendingIndex)
      .commit();

    if (!result.ok) {
      throw new WebhookRepositoryConflictError(
        `Queued Discord message already exists: ${input.id}`,
      );
    }

    return toQueuedDiscordMessageRecord({
      record,
      discordWebhookUrl: webhookUrlSecret.url,
    });
  }

  async getDiscordWebhookMessage(
    id: string,
  ): Promise<QueuedDiscordMessageRecord | null> {
    const entry = await this.kv.get<QueuedDiscordMessageKvRecord>(
      queueMessageKey(id),
    );
    if (entry.value === null) return null;

    return await this.toQueuedDiscordMessageRecord(entry.value);
  }

  async scanPendingDiscordWebhookMessages(
    options: ScanDiscordWebhookQueueOptions = {},
  ): Promise<QueuedDiscordMessageRecord[]> {
    if (options.limit !== undefined && options.limit <= 0) return [];

    const records: QueuedDiscordMessageRecord[] = [];
    const now = options.now ?? new Date();
    const entries = this.kv.list<PendingQueueIndex>(
      { prefix: pendingQueueIndexPrefix },
    );

    for await (const entry of entries) {
      const message = await this.getDiscordWebhookMessage(
        entry.value.messageId,
      );
      if (message === null) continue;

      if (
        message.status === "pending" ||
        this.isExpiredProcessing(message, now)
      ) {
        records.push(message);
        if (options.limit !== undefined && records.length >= options.limit) {
          break;
        }
      }
    }

    return records;
  }

  async scanPendingDiscordWebhookMessagePage(
    options: ScanPendingDiscordWebhookMessagePageOptions,
  ): Promise<PendingDiscordWebhookMessagePage> {
    if (options.limit <= 0) {
      return { messages: [], scannedCount: 0 };
    }

    const now = options.now ?? new Date();
    const entries = this.kv.list<PendingQueueIndex>(
      { prefix: pendingQueueIndexPrefix },
      {
        cursor: options.cursor,
        limit: options.limit,
      },
    );
    const messages: QueuedDiscordMessageRecord[] = [];
    let scannedCount = 0;

    for await (const entry of entries) {
      scannedCount += 1;
      const message = await this.getDiscordWebhookMessage(
        entry.value.messageId,
      );
      if (message === null) continue;

      if (
        message.status === "pending" ||
        this.isExpiredProcessing(message, now)
      ) {
        messages.push(message);
      }
    }

    return {
      messages,
      scannedCount,
      ...(scannedCount < options.limit ? {} : { cursor: entries.cursor }),
    };
  }

  async claimDiscordWebhookMessage(
    id: string,
    input: ClaimDiscordWebhookMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null> {
    const key = queueMessageKey(id);
    const entry = await this.kv.get<QueuedDiscordMessageKvRecord>(key);
    if (entry.value === null) return null;
    if (entry.value.status !== "pending") {
      if (
        !this.isExpiredProcessing(entry.value, input.now ?? new Date())
      ) {
        return null;
      }
    }

    const now = input.now ?? new Date();
    const updatedRecord = createQueuedDiscordMessageKvRecord({
      ...entry.value,
      claimId: input.claimId,
      status: "processing",
      processingUntilEpochMs: now.getTime() +
        Math.max(1, input.leaseMs ?? DEFAULT_PROCESSING_LEASE_MS),
      updatedAt: now.toISOString(),
    });

    const result = await this.kv.atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .set(key, updatedRecord)
      .commit();
    if (!result.ok) return null;

    return await this.toQueuedDiscordMessageRecord(updatedRecord);
  }

  async markDiscordWebhookMessageSent(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    return await this.updateTerminalStatus(id, "sent", input);
  }

  async moveDiscordWebhookMessageToDeadLetter(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    return await this.updateTerminalStatus(id, "dead", input);
  }

  async recordDiscordWebhookMessageFailure(
    id: string,
    input: UpdateQueuedDiscordMessageInput = {},
  ): Promise<QueuedDiscordMessageRecord | null> {
    const key = queueMessageKey(id);
    const entry = await this.kv.get<QueuedDiscordMessageKvRecord>(key);
    if (entry.value === null) return null;
    if (!this.isRetryableStatus(entry.value.status)) return null;
    if (!this.matchesClaim(entry.value, input.claimId)) return null;

    const updatedRecord = createQueuedDiscordMessageKvRecord({
      ...entry.value,
      attempts: input.incrementAttempts === false
        ? entry.value.attempts
        : entry.value.attempts + 1,
      claimId: undefined,
      lastError: input.lastError,
      processingUntilEpochMs: undefined,
      status: "pending",
      updatedAt: (input.now ?? new Date()).toISOString(),
    });

    const result = await this.kv.atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .set(key, updatedRecord)
      .commit();
    if (!result.ok) return null;

    return await this.toQueuedDiscordMessageRecord(updatedRecord);
  }

  async listDeadDiscordWebhookMessages(
    options: ScanDiscordWebhookQueueOptions = {},
  ): Promise<QueuedDiscordMessageRecord[]> {
    const records: QueuedDiscordMessageRecord[] = [];
    const entries = this.kv.list<DeadQueueIndex>(
      { prefix: deadQueueIndexPrefix },
      { limit: options.limit },
    );

    for await (const entry of entries) {
      const message = await this.getDiscordWebhookMessage(
        entry.value.messageId,
      );
      if (message?.status === "dead") {
        records.push(message);
      }
    }

    return records;
  }

  private async updateTerminalStatus(
    id: string,
    status: "sent" | "dead",
    input: UpdateQueuedDiscordMessageInput,
  ): Promise<QueuedDiscordMessageRecord | null> {
    const key = queueMessageKey(id);
    const entry = await this.kv.get<QueuedDiscordMessageKvRecord>(key);
    if (entry.value === null) return null;
    if (!this.isRetryableStatus(entry.value.status)) return null;
    if (!this.matchesClaim(entry.value, input.claimId)) return null;

    const updatedAtDate = input.now ?? new Date();
    const updatedRecord = createQueuedDiscordMessageKvRecord({
      ...entry.value,
      attempts: input.incrementAttempts
        ? entry.value.attempts + 1
        : entry.value.attempts,
      claimId: undefined,
      lastError: input.lastError,
      processingUntilEpochMs: undefined,
      status,
      updatedAt: updatedAtDate.toISOString(),
    });

    let operation = this.kv.atomic()
      .check({ key, versionstamp: entry.versionstamp })
      .set(key, updatedRecord)
      .delete(pendingQueueIndexKey(
        new Date(entry.value.createdAt).getTime(),
        id,
      ));

    if (status === "dead") {
      operation = operation.set(
        deadQueueIndexKey(updatedAtDate.getTime(), id),
        { messageId: id } satisfies DeadQueueIndex,
      );
    }

    const result = await operation.commit();
    if (!result.ok) return null;

    return await this.toQueuedDiscordMessageRecord(updatedRecord);
  }

  private isRetryableStatus(status: string): boolean {
    return status === "pending" || status === "processing";
  }

  private matchesClaim(
    message: QueuedDiscordMessageKvRecord,
    claimId: string | undefined,
  ): boolean {
    if (claimId === undefined) return message.status !== "processing";
    return message.status === "processing" && message.claimId === claimId;
  }

  private isExpiredProcessing(
    message: { status: string; processingUntilEpochMs?: number },
    now: Date,
  ): boolean {
    return message.status === "processing" &&
      (message.processingUntilEpochMs ?? 0) <= now.getTime();
  }

  private async toQueuedDiscordMessageRecord(
    record: QueuedDiscordMessageKvRecord,
  ): Promise<QueuedDiscordMessageRecord> {
    return toQueuedDiscordMessageRecord({
      record,
      discordWebhookUrl: await decryptQueuedDiscordWebhookUrl(record),
    });
  }
}
