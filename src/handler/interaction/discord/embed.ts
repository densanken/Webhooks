import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColor } from "../response.ts";

type WebhookNotFoundReason = "missing" | "guild-mismatch";

export const notFoundDiscordWebhookEmbed = (
  reason: WebhookNotFoundReason,
  uuid: string,
): APIEmbed => {
  if (reason === "missing") {
    return {
      title: "指定した ID の Discord Webhook が見つかりませんでした",
      description: "`/webhook discord list` で ID を確認してください",
      color: EmbedColor.Error,
      fields: [
        {
          name: "リクエストされた Webhook ID",
          value: `\`${uuid}\``,
        },
      ],
    } satisfies APIEmbed;
  }

  return {
    title: "指定した ID の Discord Webhook が見つかりませんでした",
    description: "他サーバーで登録した Webhook ではありませんか？",
    color: EmbedColor.Error,
    fields: [
      {
        name: "リクエストされた Webhook ID",
        value: `\`${uuid}\``,
      },
    ],
    footer: {
      text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
    },
  } satisfies APIEmbed;
};

export const noInputDiscordWebhookUUIDEmbed: APIEmbed = {
  title: "Discord Webhook ID を指定してください",
  description: "ID が入力されていません",
  color: EmbedColor.Error,
  footer: {
    text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
  },
} satisfies APIEmbed;
