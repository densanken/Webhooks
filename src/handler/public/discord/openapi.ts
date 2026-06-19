// 公開 Webhook エンドポイントの OpenAPI ドキュメント
//
// 公開ルート (`route.ts`) は Ajv でリクエストボディを検証する (zod ではない) ため、
// OpenAPI 定義は 3.1 フラグメントとしてここに保持し `handler/admin.ts` の管理ドキュメントに統合する
// ここではエンドポイントの説明だけを持ち、リクエスト検証は行わない

export const PUBLIC_DISCORD_WEBHOOK_TAG = "Public Discord Webhooks";

const DISCORD_EXECUTE_WEBHOOK_DOCS =
  "https://docs.discord.com/developers/resources/webhook#execute-webhook";

// Scalar は `externalDocs` をオペレーションレベルで表示する (スキーマではない) ため、
// リンクを各オペレーションに付与し、ボディの説明にも含める
const discordExecuteWebhookExternalDocs = {
  description: "Discord: Execute Webhook (JSON/Form params)",
  url: DISCORD_EXECUTE_WEBHOOK_DOCS,
};

// ボディは Discord Execute Webhook の JSON ボディで、ルート内で Ajv により検証される
// 全フィールドを再定義するのではなく、Discord のリファレンスへのリンクとして文書化する
const discordWebhookRequestBody = {
  required: true,
  description:
    `Discord Webhook で送信する内容。content, embeds, components, poll のいずれかを含める必要があります。添付ファイルやファイルアップロードには対応していません。詳細は [Discord Execute Webhook リファレンス](${DISCORD_EXECUTE_WEBHOOK_DOCS}) を参照してください。`,
  content: {
    "application/json": {
      schema: {
        type: "object",
        additionalProperties: true,
      },
      examples: {
        content: {
          summary: "Content only",
          value: { content: "hello" },
        },
        embed: {
          summary: "Embed",
          value: {
            embeds: [{ title: "Deploy finished", description: "v1.2.3" }],
          },
        },
      },
    },
  },
};

const sentResponse = {
  description: "Discord に即時送信されました",
};

const queuedResponse = {
  description:
    "Discord がレート制限中のため、メッセージは後で送信されるようキューに入れられました",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["queued"],
            description: "キュー投入状態",
          },
          reason: {
            type: "string",
            enum: ["blocked", "rate_limited"],
            description: "キュー投入理由",
          },
        },
        required: ["status", "reason"],
      },
    },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "エラーメッセージ",
          },
          code: {
            type: "string",
            description: "エラーコード",
          },
          upstreamStatus: {
            type: "integer",
            description: "上流レスポンスの HTTP ステータス",
          },
        },
        required: ["error"],
      },
    },
  },
});

const commonResponses = {
  204: sentResponse,
  202: queuedResponse,
  400: errorResponse("Discord Webhook のボディまたは送信先 URL が不正です"),
  401: errorResponse("認証情報が不足しているか無効です"),
  404: errorResponse("Webhook が見つからないか削除済みです"),
  413: errorResponse("リクエストボディが 1 MiB の上限を超えています"),
  415: errorResponse("リクエストボディが application/json ではありません"),
  502: errorResponse("Discord が 429 以外のエラーを返しました"),
};

export const publicWebhookOpenApiPaths = {
  "/discord/webhooks/{uuid}/{token}": {
    post: {
      tags: [PUBLIC_DISCORD_WEBHOOK_TAG],
      description: "登録済み Discord Webhook に送信します。",
      externalDocs: discordExecuteWebhookExternalDocs,
      parameters: [
        {
          name: "uuid",
          in: "path",
          required: true,
          description: "登録済み Discord Webhook の UUID",
          schema: { type: "string" },
        },
        {
          name: "token",
          in: "path",
          required: true,
          description: "登録済み Discord Webhook のパストークン",
          schema: { type: "string" },
        },
      ],
      requestBody: discordWebhookRequestBody,
      responses: commonResponses,
    },
  },
  "/discord/webhooks": {
    post: {
      tags: [PUBLIC_DISCORD_WEBHOOK_TAG],
      description: "リクエストごとに指定した Discord Webhook に送信します。",
      externalDocs: discordExecuteWebhookExternalDocs,
      parameters: [
        {
          name: "X-Webhook-Token-Id",
          in: "header",
          required: true,
          description: "動的 Webhook 用トークンの UUID",
          schema: { type: "string" },
        },
        {
          name: "Authorization",
          in: "header",
          required: true,
          description: "Bearer <token>",
          schema: { type: "string" },
        },
        {
          name: "X-Discord-Webhook-Url",
          in: "header",
          required: true,
          description: "送信先の Discord Webhook URL",
          schema: { type: "string" },
        },
      ],
      requestBody: discordWebhookRequestBody,
      responses: commonResponses,
    },
  },
};
