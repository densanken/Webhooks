import {
  InvalidDiscordWebhookUrlError,
  parseDiscordWebhookUrl,
} from "../../../util/discord/webhook-url.ts";
import { parseDiscordWebhookJsonRequest } from "../../../util/discord/webhook-body.ts";
import { verifyBearerTokenHash } from "../../../util/crypto.ts";
import type { DiscordSendResult } from "../sender/interface.ts";
import {
  invalidDiscordWebhookUrlError,
  notFoundError,
  unauthorizedError,
  upstreamError,
} from "../../error/factory.ts";
import {
  readDynamicDiscordWebhookHeaders,
  timingSafeStringEqual,
} from "./auth.ts";
import type { DiscordExecuteUseCaseOptions } from "./dependencies.ts";
import { UseCaseError } from "../../error/impl.ts";
import type {
  DiscordExecuteResult,
  DiscordExecuteUseCaseInterface,
  ExecuteDynamicDiscordWebhookInput,
  ExecuteRegisteredDiscordWebhookInput,
} from "./interface.ts";
import {
  isActiveRateLimit,
  toBlockedUntilEpochMs,
  toSafeRetryAfterMs,
} from "../../../util/discord/rate-limit.ts";

export class DiscordExecuteUseCase implements DiscordExecuteUseCaseInterface {
  private readonly registeredRepository:
    DiscordExecuteUseCaseOptions["registeredRepository"];
  private readonly tokenRepository:
    DiscordExecuteUseCaseOptions["tokenRepository"];
  private readonly queueRepository:
    DiscordExecuteUseCaseOptions["queueRepository"];
  private readonly rateLimitRepository:
    DiscordExecuteUseCaseOptions["rateLimitRepository"];
  private readonly sender: DiscordExecuteUseCaseOptions["sender"];
  private readonly guildWebhooksUseCase:
    DiscordExecuteUseCaseOptions["guildWebhooksUseCase"];
  private readonly generateQueueMessageId: () => string;
  private readonly getNow: () => Date;

  constructor(options: DiscordExecuteUseCaseOptions) {
    this.registeredRepository = options.registeredRepository;
    this.tokenRepository = options.tokenRepository;
    this.queueRepository = options.queueRepository;
    this.rateLimitRepository = options.rateLimitRepository;
    this.sender = options.sender;
    this.guildWebhooksUseCase = options.guildWebhooksUseCase;
    this.generateQueueMessageId = options.generateQueueMessageId ??
      (() => crypto.randomUUID());
    this.getNow = options.getNow ?? (() => new Date());
  }

  async executeRegisteredDiscordWebhook(
    input: ExecuteRegisteredDiscordWebhookInput,
  ): Promise<DiscordExecuteResult> {
    const record = await this.registeredRepository
      .getRegisteredDiscordWebhook(input.uuid);
    if (record === null) {
      throw notFoundError(
        `Registered Discord webhook not found: ${input.uuid}`,
      );
    }

    if (!timingSafeStringEqual(input.pathToken, record.pathToken)) {
      throw unauthorizedError("Invalid registered webhook token");
    }

    const body = await parseDiscordWebhookJsonRequest(input.request);

    return await this.submitDiscordWebhook({
      sourceType: "registered",
      sourceId: record.uuid,
      discordWebhookUrl: record.discordWebhookUrl,
      discordWebhookUrlHash: record.discordWebhookUrlHash,
      body,
      now: input.now,
    });
  }

  async executeDynamicDiscordWebhook(
    input: ExecuteDynamicDiscordWebhookInput,
  ): Promise<DiscordExecuteResult> {
    const { tokenId, bearerToken, discordWebhookUrl } =
      readDynamicDiscordWebhookHeaders(input.request.headers);

    const tokenRecord = await this.tokenRepository.getDynamicWebhookToken(
      tokenId,
    );
    if (
      tokenRecord === null ||
      !await verifyBearerTokenHash(bearerToken, tokenRecord.tokenHash)
    ) {
      throw unauthorizedError("Invalid dynamic webhook token");
    }

    if (this.guildWebhooksUseCase && tokenRecord.owner?.guildId) {
      let parsed;
      try {
        parsed = parseDiscordWebhookUrl(discordWebhookUrl);
      } catch (error) {
        if (error instanceof InvalidDiscordWebhookUrlError) {
          throw invalidDiscordWebhookUrlError(error.message);
        }
        throw error;
      }

      const { guildId } = tokenRecord.owner;
      const allowed = await this.guildWebhooksUseCase
        .isGuildWebhookWithRefresh(
          guildId,
          parsed.webhookId,
        );
      if (!allowed) {
        throw new UseCaseError(
          "invalid_request",
          "Webhook URL is not allowed for this token's guild",
          400,
        );
      }
    }

    const body = await parseDiscordWebhookJsonRequest(input.request);

    try {
      return await this.submitDiscordWebhook({
        sourceType: "dynamic",
        sourceId: tokenRecord.uuid,
        discordWebhookUrl,
        body,
        now: input.now,
      });
    } catch (error) {
      if (error instanceof InvalidDiscordWebhookUrlError) {
        throw invalidDiscordWebhookUrlError(error.message);
      }
      throw error;
    }
  }

  private async submitDiscordWebhook(input: {
    sourceType: "registered" | "dynamic";
    sourceId: string;
    discordWebhookUrl: string;
    discordWebhookUrlHash?: string;
    body: unknown;
    now?: Date;
  }): Promise<DiscordExecuteResult> {
    const now = this.resolveNow(input.now);
    const activeRateLimit = input.discordWebhookUrlHash === undefined
      ? await this.rateLimitRepository.getDiscordUrlRateLimitForWebhookUrl(
        input.discordWebhookUrl,
      )
      : await this.rateLimitRepository.getDiscordUrlRateLimit(
        input.discordWebhookUrlHash,
      );

    if (
      activeRateLimit !== null &&
      isActiveRateLimit(activeRateLimit.blockedUntilEpochMs, now)
    ) {
      const queued = await this.queueRepository.enqueueDiscordWebhookMessage({
        id: this.generateQueueMessageId(),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        discordWebhookUrl: input.discordWebhookUrl,
        body: input.body,
        now,
      });

      return {
        status: "queued",
        statusCode: 202,
        reason: "blocked",
        queuedMessageId: queued.id,
        blockedUntilEpochMs: activeRateLimit.blockedUntilEpochMs,
      };
    }

    let result: DiscordSendResult;
    try {
      result = await this.sender.sendDiscordWebhook({
        discordWebhookUrl: input.discordWebhookUrl,
        body: input.body,
      });
    } catch {
      throw upstreamError();
    }

    if (result.ok) {
      return {
        status: "sent",
        statusCode: 204,
      };
    }

    if (result.reason !== "rate_limited") {
      throw upstreamError(undefined, result.upstreamStatus);
    }

    const completedAt = this.resolveNow(input.now);
    const retryAfterMs = toSafeRetryAfterMs(result.retryAfterMs);
    const blockedUntilEpochMs = toBlockedUntilEpochMs(
      completedAt,
      retryAfterMs,
      result.blockedUntilEpochMs,
    );

    if (input.discordWebhookUrlHash === undefined) {
      await this.rateLimitRepository.setDiscordUrlRateLimitForWebhookUrl({
        discordWebhookUrl: input.discordWebhookUrl,
        blockedUntilEpochMs,
        retryAfterMs,
        scope: result.scope,
        bucket: result.bucket,
        now: completedAt,
      });
    } else {
      await this.rateLimitRepository.setDiscordUrlRateLimit({
        discordWebhookUrlHash: input.discordWebhookUrlHash,
        blockedUntilEpochMs,
        retryAfterMs,
        scope: result.scope,
        bucket: result.bucket,
        now: completedAt,
      });
    }

    const queued = await this.queueRepository.enqueueDiscordWebhookMessage({
      id: this.generateQueueMessageId(),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      discordWebhookUrl: input.discordWebhookUrl,
      body: input.body,
      now: completedAt,
    });

    return {
      status: "queued",
      statusCode: 202,
      reason: "rate_limited",
      queuedMessageId: queued.id,
      blockedUntilEpochMs,
    };
  }

  private resolveNow(fixedNow: Date | undefined): Date {
    return fixedNow ?? this.getNow();
  }
}
