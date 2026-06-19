import { z } from "@hono/zod-openapi";

import { parseDiscordWebhookUrl } from "../../../util/discord/webhook-url.ts";

const DescriptionSchema = z.string().max(200).openapi({
  description: "リソースの説明",
  example: "production alerts",
});

const UuidSchema = z.uuid().openapi({
  description: "リソースの UUID",
  example: "9b559796-108a-4dbb-a9da-946fea59d62f",
});

const CreatedAtSchema = z.string().openapi({
  description: "ISO 8601 形式の作成日時",
  example: "2026-06-06T00:00:00.000Z",
});

const UpdatedAtSchema = z.string().openapi({
  description: "ISO 8601 形式の更新日時",
  example: "2026-06-06T00:00:00.000Z",
});

const DiscordWebhookUrlSchema = z.string().superRefine((value, context) => {
  try {
    parseDiscordWebhookUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error
        ? error.message
        : "Invalid Discord webhook URL",
    });
  }
}).openapi({
  description: "Discord Webhook URL",
  example:
    "https://discord.com/api/webhooks/12345678901234567/abcdefghijklmnopqrstuvwxyzABCDEF",
});

export const ResourceUuidParamsSchema = z.object({
  uuid: UuidSchema,
});

export const CreateRegisteredDiscordWebhookRequestSchema = z.object({
  discordWebhookUrl: DiscordWebhookUrlSchema,
  description: DescriptionSchema,
}).openapi("CreateRegisteredDiscordWebhookRequest");

export const RegisteredDiscordWebhookSummarySchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  createdAt: CreatedAtSchema,
  updatedAt: UpdatedAtSchema,
}).openapi("RegisteredDiscordWebhookSummary");

export const RegisteredDiscordWebhookSummaryArraySchema = z.array(
  RegisteredDiscordWebhookSummarySchema,
).openapi("RegisteredDiscordWebhookSummaries");

export const CreatedRegisteredDiscordWebhookSchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  webhookUrl: z.string().openapi({
    description: "公開 Webhook URL",
  }),
  discordWebhookUrl: z.string().openapi({
    description: "Discord Webhook URL",
  }),
  createdAt: CreatedAtSchema,
}).openapi("CreatedRegisteredDiscordWebhook");

export const RegisteredDiscordWebhookDetailSchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  discordWebhookUrl: z.string().openapi({
    description: "Discord Webhook URL",
  }),
  webhookUrl: z.string().openapi({
    description: "公開 Webhook URL",
  }),
  createdAt: CreatedAtSchema,
  updatedAt: UpdatedAtSchema,
}).openapi("RegisteredDiscordWebhookDetail");

export const UpdateRegisteredDiscordWebhookRequestSchema = z.object({
  description: DescriptionSchema,
}).openapi("UpdateRegisteredDiscordWebhookRequest");

export const UpdatedRegisteredDiscordWebhookSchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  createdAt: CreatedAtSchema,
  updatedAt: UpdatedAtSchema,
}).openapi("UpdatedRegisteredDiscordWebhook");

export const ErrorResponseSchema = z.object({
  error: z.string().openapi({
    description: "エラーメッセージ",
  }),
  code: z.string().optional().openapi({
    description: "エラーコード",
  }),
}).openapi("ErrorResponse");

export const ValidationErrorResponseSchema = z.object({
  error: z.string().openapi({
    description: "エラーメッセージ",
  }),
  details: z.array(z.unknown()).openapi({
    description: "バリデーションエラーの詳細",
  }),
}).openapi("ValidationErrorResponse");
