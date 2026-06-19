import type {
  DiscordSender as DiscordSenderPort,
  DiscordSendFailureReason,
  DiscordSendInput,
  DiscordSendResult,
} from "../../usecase/discord/sender/interface.ts";

type DiscordWebhookSenderFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
const DEFAULT_RETRY_AFTER_MS = 60_000;

export type DiscordWebhookSenderOptions = {
  fetcher?: DiscordWebhookSenderFetcher;
  timeoutMs?: number;
};

export class DiscordWebhookSender implements DiscordSenderPort {
  private readonly fetcher: DiscordWebhookSenderFetcher;
  private readonly timeoutMs: number;

  constructor(options: DiscordWebhookSenderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async sendDiscordWebhook(
    input: DiscordSendInput,
  ): Promise<DiscordSendResult> {
    let response: Response;
    try {
      response = await this.fetcher(input.discordWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return { ok: false, reason: "network_error" };
    }

    if (response.ok) {
      await response.body?.cancel();
      return { ok: true, status: response.status };
    }

    if (response.status === 429) {
      return await this.toRateLimitedResult(response);
    }

    await response.body?.cancel();
    return {
      ok: false,
      reason: this.toFailureReason(response.status),
      upstreamStatus: response.status,
    };
  }

  private async toRateLimitedResult(
    response: Response,
  ): Promise<DiscordSendResult> {
    const body = await this.readJsonObject(response);
    const retryAfterMs = this.readRetryAfterMs(response, body);
    const blockedUntilEpochMs = this.readBlockedUntilEpochMs(response);
    const scope = response.headers.get("x-ratelimit-scope") ?? undefined;
    const bucket = response.headers.get("x-ratelimit-bucket") ?? undefined;

    return {
      ok: false,
      reason: "rate_limited",
      upstreamStatus: 429,
      retryAfterMs,
      ...(blockedUntilEpochMs === undefined ? {} : { blockedUntilEpochMs }),
      ...(scope === undefined ? {} : { scope }),
      ...(bucket === undefined ? {} : { bucket }),
    };
  }

  private async readJsonObject(
    response: Response,
  ): Promise<Record<string, unknown>> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      await response.body?.cancel();
      return {};
    }

    try {
      const body = await response.json();
      return body !== null && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private readRetryAfterMs(
    response: Response,
    body: Record<string, unknown>,
  ): number {
    const retryAfterFromBody = body.retry_after;
    if (typeof retryAfterFromBody === "number") {
      return (
        this.secondsToMilliseconds(retryAfterFromBody) ?? DEFAULT_RETRY_AFTER_MS
      );
    }

    const retryAfterHeader = response.headers.get("retry-after") ??
      response.headers.get("x-ratelimit-reset-after");
    if (retryAfterHeader !== null) {
      return (
        this.secondsToMilliseconds(Number(retryAfterHeader)) ??
          DEFAULT_RETRY_AFTER_MS
      );
    }

    return DEFAULT_RETRY_AFTER_MS;
  }

  private readBlockedUntilEpochMs(response: Response): number | undefined {
    const resetHeader = response.headers.get("x-ratelimit-reset");
    if (resetHeader === null) return undefined;

    const resetEpochSeconds = Number(resetHeader);
    if (!Number.isFinite(resetEpochSeconds) || resetEpochSeconds < 0) {
      return undefined;
    }

    return Math.trunc(resetEpochSeconds * 1_000);
  }

  private secondsToMilliseconds(seconds: number): number | undefined {
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.trunc(seconds * 1_000);
  }

  private toFailureReason(
    status: number,
  ): Exclude<DiscordSendFailureReason, "rate_limited"> {
    if (status === 400) return "bad_request";
    if (status === 401) return "unauthorized";
    if (status === 403) return "forbidden";
    if (status === 404) return "not_found";
    if (status >= 500 && status <= 599) return "server_error";
    return "unknown";
  }
}
