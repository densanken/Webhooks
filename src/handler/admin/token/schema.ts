import { z } from "@hono/zod-openapi";

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

export const ResourceUuidParamsSchema = z.object({
  uuid: UuidSchema,
});

export const CreateWebhookTokenRequestSchema = z.object({
  description: DescriptionSchema,
}).openapi("CreateDynamicWebhookTokenRequest");

export const WebhookTokenSummarySchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  createdAt: CreatedAtSchema,
  updatedAt: UpdatedAtSchema,
}).openapi("DynamicWebhookTokenSummary");

export const WebhookTokenSummaryArraySchema = z.array(
  WebhookTokenSummarySchema,
).openapi("DynamicWebhookTokenSummaries");

export const CreatedWebhookTokenSchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  token: z.string().openapi({
    description: "リソース作成時にのみ返される Bearer トークン",
  }),
  createdAt: CreatedAtSchema,
}).openapi("CreatedDynamicWebhookToken");

export const UpdateWebhookTokenRequestSchema = z.object({
  description: DescriptionSchema.optional(),
}).openapi("UpdateDynamicWebhookTokenRequest");

export const UpdatedWebhookTokenSchema = z.object({
  uuid: UuidSchema,
  description: DescriptionSchema,
  createdAt: CreatedAtSchema,
  updatedAt: UpdatedAtSchema,
}).openapi("UpdatedDynamicWebhookToken");

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
