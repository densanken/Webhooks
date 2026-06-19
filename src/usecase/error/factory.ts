import { UseCaseError } from "./impl.ts";

export const invalidDiscordWebhookUrlError = (
  message = "Invalid Discord webhook URL",
): UseCaseError =>
  new UseCaseError("invalid_discord_webhook_url", message, 400);

export const notFoundError = (message: string): UseCaseError =>
  new UseCaseError("not_found", message, 404);

export const unauthorizedError = (message: string): UseCaseError =>
  new UseCaseError("unauthorized", message, 401);

export const upstreamError = (
  message = "Discord webhook request failed",
  upstreamStatus?: number,
): UseCaseError =>
  new UseCaseError("upstream_error", message, 502, { upstreamStatus });
