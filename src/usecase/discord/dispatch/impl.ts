import {
  type QueuedDiscordMessageError,
  type QueuedDiscordMessageRecord,
} from "../../../repository/discord/queue/interface.ts";
import type { DiscordSendResult } from "../sender/interface.ts";
import type { DiscordDispatchUseCaseOptions } from "./dependencies.ts";
import type {
  DiscordDispatchUseCaseInterface,
  DispatchPendingInput,
  DispatchPendingResult,
} from "./interface.ts";
import {
  DEFAULT_DISPATCH_LIMIT,
  DEFAULT_DISPATCH_MAX_SCAN_PAGES,
  DEFAULT_DISPATCH_SCAN_PAGE_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_SEND_INTERVAL_MS,
  DEFAULT_SEND_RESERVATION_MS,
  isActiveRateLimit,
  isTerminalFailure,
  toBlockedUntilEpochMs,
  toQueuedDiscordMessageError,
  toSafeRetryAfterMs,
} from "./policy.ts";

export class DiscordDispatchUseCase implements DiscordDispatchUseCaseInterface {
  private readonly queueRepository:
    DiscordDispatchUseCaseOptions["queueRepository"];
  private readonly rateLimitRepository:
    DiscordDispatchUseCaseOptions["rateLimitRepository"];
  private readonly sender: DiscordDispatchUseCaseOptions["sender"];
  private readonly generateClaimId: () => string;
  private readonly getNow: () => Date;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(options: DiscordDispatchUseCaseOptions) {
    this.queueRepository = options.queueRepository;
    this.rateLimitRepository = options.rateLimitRepository;
    this.sender = options.sender;
    this.generateClaimId = options.generateClaimId ??
      (() => crypto.randomUUID());
    this.getNow = options.getNow ?? (() => new Date());
    this.wait = options.wait ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async dispatchPendingDiscordWebhookMessages(
    input: DispatchPendingInput = {},
  ): Promise<DispatchPendingResult> {
    const scanNow = this.resolveNow(input.now);
    const limit = Math.max(0, input.limit ?? DEFAULT_DISPATCH_LIMIT);
    const maxAttempts = Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const sendIntervalMs = Math.max(
      0,
      input.sendIntervalMs ?? DEFAULT_SEND_INTERVAL_MS,
    );
    const sendReservationMs = Math.max(
      DEFAULT_SEND_RESERVATION_MS,
      input.processingLeaseMs ?? 0,
    );
    const result: DispatchPendingResult = {
      scanned: 0,
      sent: 0,
      skipped: 0,
      retried: 0,
      rateLimited: 0,
      dead: 0,
      deadMessages: [],
    };

    if (limit === 0) return result;

    const scanPageSize = Math.max(DEFAULT_DISPATCH_SCAN_PAGE_SIZE, limit);
    const maxScanCount = scanPageSize * DEFAULT_DISPATCH_MAX_SCAN_PAGES;
    let sendCount = 0;
    let scannedEntryCount = 0;
    let cursor: string | undefined;

    while (sendCount < limit && scannedEntryCount < maxScanCount) {
      const page = await this.queueRepository
        .scanPendingDiscordWebhookMessagePage({
          cursor,
          limit: Math.min(scanPageSize, maxScanCount - scannedEntryCount),
          now: scanNow,
        });
      scannedEntryCount += page.scannedCount;
      if (page.scannedCount === 0) break;

      for (const message of page.messages) {
        if (sendCount >= limit) break;
        result.scanned += 1;

        let now = this.resolveNow(input.now);
        if (
          await this.hasActiveDiscordUrlRateLimit(
            message.discordWebhookUrlHash,
            now,
          )
        ) {
          result.skipped += 1;
          continue;
        }

        if (sendCount > 0 && sendIntervalMs > 0) {
          await this.wait(sendIntervalMs);
          now = this.resolveNow(input.now);
        }

        const claimId = this.generateClaimId();
        const reservedRateLimit = await this.rateLimitRepository
          .reserveDiscordUrlRateLimit({
            discordWebhookUrlHash: message.discordWebhookUrlHash,
            reservationId: claimId,
            reservationMs: sendReservationMs,
            now,
          });
        if (reservedRateLimit === null) {
          result.skipped += 1;
          continue;
        }

        try {
          const claimedMessage = await this.queueRepository
            .claimDiscordWebhookMessage(message.id, {
              claimId,
              now,
              leaseMs: input.processingLeaseMs,
            });
          if (claimedMessage === null) {
            result.skipped += 1;
            continue;
          }

          sendCount += 1;

          const sendResult = await this.sendSafely(
            claimedMessage.discordWebhookUrl,
            claimedMessage.body,
          );
          const completedAt = this.resolveNow(input.now);

          if (sendResult.ok) {
            const sent = await this.queueRepository
              .markDiscordWebhookMessageSent(
                claimedMessage.id,
                {
                  claimId,
                  now: completedAt,
                },
              );
            if (sent === null) {
              result.skipped += 1;
              continue;
            }

            result.sent += 1;
            continue;
          }

          if (sendResult.reason === "rate_limited") {
            const retryAfterMs = toSafeRetryAfterMs(sendResult.retryAfterMs);
            const blockedUntilEpochMs = toBlockedUntilEpochMs(
              completedAt,
              retryAfterMs,
              sendResult.blockedUntilEpochMs,
            );

            await this.rateLimitRepository.setDiscordUrlRateLimit({
              discordWebhookUrlHash: claimedMessage.discordWebhookUrlHash,
              blockedUntilEpochMs,
              retryAfterMs,
              scope: sendResult.scope,
              bucket: sendResult.bucket,
              now: completedAt,
            });
            const updated = await this.queueRepository
              .recordDiscordWebhookMessageFailure(claimedMessage.id, {
                claimId,
                incrementAttempts: false,
                lastError: { reason: "rate_limited", upstreamStatus: 429 },
                now: completedAt,
              });
            if (updated === null) {
              result.skipped += 1;
              continue;
            }

            result.rateLimited += 1;
            result.retried += 1;
            continue;
          }

          const lastError = toQueuedDiscordMessageError(sendResult);
          if (isTerminalFailure(sendResult)) {
            const dead = await this.queueRepository
              .moveDiscordWebhookMessageToDeadLetter(
                claimedMessage.id,
                {
                  claimId,
                  incrementAttempts: true,
                  lastError,
                  now: completedAt,
                },
              );
            if (dead === null) {
              result.skipped += 1;
              continue;
            }

            result.dead += 1;
            result.deadMessages.push({
              id: dead.id,
              sourceType: dead.sourceType,
              sourceId: dead.sourceId,
              attempts: dead.attempts,
              lastError: dead.lastError,
              body: dead.body,
            });
            continue;
          }

          const retriedOrDead = await this.retryOrDeadLetter(
            claimedMessage,
            claimId,
            lastError,
            maxAttempts,
            completedAt,
            result,
          );
          if (!retriedOrDead) {
            result.skipped += 1;
          }
        } finally {
          await this.releaseRateLimitReservation(
            message.discordWebhookUrlHash,
            claimId,
          );
        }
      }

      if (page.cursor === undefined || page.cursor === cursor) break;
      cursor = page.cursor;
    }

    return result;
  }

  private async sendSafely(
    discordWebhookUrl: string,
    body: unknown,
  ): Promise<DiscordSendResult> {
    try {
      return await this.sender.sendDiscordWebhook({ discordWebhookUrl, body });
    } catch {
      return { ok: false, reason: "network_error" };
    }
  }

  private async retryOrDeadLetter(
    message: QueuedDiscordMessageRecord,
    claimId: string,
    lastError: QueuedDiscordMessageError,
    maxAttempts: number,
    now: Date,
    result: DispatchPendingResult,
  ): Promise<boolean> {
    if (message.attempts + 1 >= maxAttempts) {
      const dead = await this.queueRepository
        .moveDiscordWebhookMessageToDeadLetter(
          message.id,
          {
            claimId,
            incrementAttempts: true,
            lastError: {
              reason: "max_attempts_exceeded",
              upstreamStatus: lastError.upstreamStatus,
            },
            now,
          },
        );
      if (dead === null) return false;

      result.dead += 1;
      result.deadMessages.push({
        id: dead.id,
        sourceType: dead.sourceType,
        sourceId: dead.sourceId,
        attempts: dead.attempts,
        lastError: dead.lastError,
        body: dead.body,
      });
      return true;
    }

    const updated = await this.queueRepository
      .recordDiscordWebhookMessageFailure(message.id, {
        claimId,
        lastError,
        now,
      });
    if (updated === null) return false;

    result.retried += 1;
    return true;
  }

  private async hasActiveDiscordUrlRateLimit(
    discordWebhookUrlHash: string,
    now: Date,
  ): Promise<boolean> {
    const rateLimit = await this.rateLimitRepository.getDiscordUrlRateLimit(
      discordWebhookUrlHash,
    );

    return rateLimit !== null &&
      isActiveRateLimit(rateLimit.blockedUntilEpochMs, now);
  }

  private async releaseRateLimitReservation(
    discordWebhookUrlHash: string,
    reservationId: string,
  ): Promise<void> {
    await this.rateLimitRepository.releaseDiscordUrlRateLimitReservation({
      discordWebhookUrlHash,
      reservationId,
    });
  }

  private resolveNow(fixedNow: Date | undefined): Date {
    return fixedNow ?? this.getNow();
  }
}
