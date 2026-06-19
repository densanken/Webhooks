import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

import { unauthorizedError } from "../../error/factory.ts";
import { UseCaseError } from "../../error/impl.ts";

const WEBHOOK_TOKEN_ID_HEADER = "x-webhook-token-id";
const DISCORD_WEBHOOK_URL_HEADER = "x-discord-webhook-url";
const AUTHORIZATION_HEADER = "authorization";

export type DynamicDiscordWebhookHeaders = {
  tokenId: string;
  bearerToken: string;
  discordWebhookUrl: string;
};

export const readDynamicDiscordWebhookHeaders = (
  headers: Headers,
): DynamicDiscordWebhookHeaders => ({
  tokenId: readRequiredHeader(
    headers,
    WEBHOOK_TOKEN_ID_HEADER,
    "Missing dynamic webhook token id",
    401,
  ),
  bearerToken: readBearerToken(headers),
  discordWebhookUrl: readRequiredHeader(
    headers,
    DISCORD_WEBHOOK_URL_HEADER,
    "Missing Discord webhook URL",
    400,
  ),
});

export const timingSafeStringEqual = (
  actual: string,
  expected: string,
): boolean => {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);

  const maxLen = Math.max(actualBytes.byteLength, expectedBytes.byteLength);
  if (maxLen === 0) return true;
  const paddedActual = new Uint8Array(maxLen);
  const paddedExpected = new Uint8Array(maxLen);
  paddedActual.set(actualBytes);
  paddedExpected.set(expectedBytes);
  return timingSafeEqual(paddedActual, paddedExpected);
};

const readRequiredHeader = (
  headers: Headers,
  headerName: string,
  message: string,
  status: 400 | 401,
): string => {
  const value = headers.get(headerName)?.trim();
  if (value) return value;

  if (status === 401) {
    throw unauthorizedError(message);
  }

  throw new UseCaseError("invalid_request", message, 400);
};

const readBearerToken = (headers: Headers): string => {
  const value = headers.get(AUTHORIZATION_HEADER)?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (match === null || match[1] === "") {
    throw unauthorizedError("Missing bearer token");
  }

  return match[1];
};
