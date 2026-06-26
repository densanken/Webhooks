import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColor } from "../response.ts";

type TokenNotFoundReason = "missing" | "guild-mismatch";

export const notFoundTokenEmbed = (
  reason: TokenNotFoundReason,
  uuid: string,
): APIEmbed => {
  if (reason === "missing") {
    return {
      title: "指定した ID の Token が見つかりませんでした",
      description: "`/webhook token list` で ID を確認してください",
      color: EmbedColor.Error,
      fields: [
        {
          name: "リクエストされた Token ID",
          value: `\`${uuid}\``,
        },
      ],
    } satisfies APIEmbed;
  }

  return {
    title: "指定した ID の Token が見つかりませんでした",
    description: "他サーバーで登録した Token ではありませんか？",
    color: EmbedColor.Error,
    fields: [
      {
        name: "リクエストされた Token ID",
        value: `\`${uuid}\``,
      },
    ],
    footer: {
      text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
    },
  } satisfies APIEmbed;
};

export const noInputTokenUUIDEmbed: APIEmbed = {
  title: "Token ID を指定してください",
  description: "ID が入力されていません",
  color: EmbedColor.Error,
  footer: {
    text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
  },
} satisfies APIEmbed;
