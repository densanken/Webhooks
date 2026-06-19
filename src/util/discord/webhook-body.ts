import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import schema from "../../generated/discord-webhook-body.schema.json" with {
  type: "json",
};
import type { DiscordWebhookBody } from "../../schema/discord-webhook-body.ts";

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE = 415;
const ATTACHMENT_URL_SCHEME = "attachment://";

export type DiscordWebhookBodyValidationErrorCode =
  | "empty_body"
  | "invalid_content_type"
  | "invalid_json"
  | "invalid_schema"
  | "multipart_not_supported";

export class DiscordWebhookBodyValidationError extends TypeError {
  readonly code: DiscordWebhookBodyValidationErrorCode;
  readonly status: 400 | 415;
  readonly issues: readonly string[];

  constructor(
    code: DiscordWebhookBodyValidationErrorCode,
    message: string,
    options: {
      status?: 400 | 415;
      issues?: readonly string[];
    } = {},
  ) {
    super(message);
    this.name = "DiscordWebhookBodyValidationError";
    this.code = code;
    this.status = options.status ?? HTTP_STATUS_BAD_REQUEST;
    this.issues = options.issues ?? [];
  }
}

const ajv = new Ajv({ allErrors: true });
const validateSchema: ValidateFunction = ajv.compile(schema);

export const parseDiscordWebhookJsonRequest = async (
  request: Request,
): Promise<DiscordWebhookBody> => {
  assertJsonContentType(request.headers.get("content-type"));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DiscordWebhookBodyValidationError(
      "invalid_json",
      "Discord webhook request body must be valid JSON",
    );
  }

  return validateDiscordWebhookBody(body);
};

export const validateDiscordWebhookBody = (
  body: unknown,
): DiscordWebhookBody => {
  if (!isJsonObject(body)) {
    throw new DiscordWebhookBodyValidationError(
      "invalid_schema",
      "Discord webhook body must be a JSON object",
    );
  }

  if (!validateSchema(body)) {
    throw new DiscordWebhookBodyValidationError(
      "invalid_schema",
      "Discord webhook body does not match Discord's JSON webhook schema",
      { issues: formatAjvErrors(validateSchema.errors ?? []) },
    );
  }

  assertSupportedJsonWebhookBody(body);
  return body as DiscordWebhookBody;
};

const assertJsonContentType = (contentType: string | null): void => {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (mediaType.startsWith("multipart/")) {
    throw new DiscordWebhookBodyValidationError(
      "multipart_not_supported",
      "Discord webhook multipart requests are not supported",
      { status: HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE },
    );
  }

  if (mediaType !== "application/json") {
    throw new DiscordWebhookBodyValidationError(
      "invalid_content_type",
      "Discord webhook request body must be JSON",
      { status: HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE },
    );
  }
};

const assertSupportedJsonWebhookBody = (
  body: Record<string, unknown>,
): void => {
  if (hasNonEmptyArray(body.attachments)) {
    throw new DiscordWebhookBodyValidationError(
      "multipart_not_supported",
      "Discord webhook attachments require multipart upload support",
    );
  }

  if (hasAttachmentUrlReference(body)) {
    throw new DiscordWebhookBodyValidationError(
      "multipart_not_supported",
      "Discord webhook attachment references require multipart upload support",
    );
  }

  if (hasNonEmptyArray(body.embeds) && hasEmptyJsonObject(body.embeds)) {
    throw new DiscordWebhookBodyValidationError(
      "invalid_schema",
      "Discord webhook embeds must not contain empty objects",
    );
  }

  if (
    hasNonEmptyString(body.content) ||
    hasNonEmptyArray(body.embeds) ||
    hasNonEmptyArray(body.components) ||
    isJsonObject(body.poll)
  ) {
    return;
  }

  throw new DiscordWebhookBodyValidationError(
    "empty_body",
    "Discord webhook body must include content, embeds, components, or poll",
  );
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const hasNonEmptyArray = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value) && value.length > 0;

const hasEmptyJsonObject = (value: readonly unknown[]): boolean =>
  value.some((item) => isJsonObject(item) && Object.keys(item).length === 0);

const hasAttachmentUrlReference = (value: unknown, key?: string): boolean => {
  if (typeof value === "string") {
    return isUrlField(key) &&
      value.toLowerCase().startsWith(ATTACHMENT_URL_SCHEME);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasAttachmentUrlReference(item, key));
  }

  if (!isJsonObject(value)) {
    return false;
  }

  return Object.entries(value).some(([childKey, childValue]) =>
    hasAttachmentUrlReference(childValue, childKey)
  );
};

const isUrlField = (key: string | undefined): boolean =>
  key === "url" || key?.endsWith("_url") === true;

const formatAjvErrors = (errors: readonly ErrorObject[]): string[] =>
  errors.map((error) => {
    const path = error.instancePath === "" ? "/" : error.instancePath;

    if (
      error.keyword === "additionalProperties" &&
      typeof error.params.additionalProperty === "string"
    ) {
      return `${path} must not include ${error.params.additionalProperty}`;
    }

    return `${path} ${error.message ?? "is invalid"}`;
  });
