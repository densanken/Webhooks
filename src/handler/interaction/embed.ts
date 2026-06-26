import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColor } from "./response.ts";

export const DESCRIPTION_MAX_LENGTH = 200;

const descriptionLength = (description: string): number =>
  Array.from(description).length;

export const isDescriptionTooLong = (description: string): boolean =>
  descriptionLength(description) > DESCRIPTION_MAX_LENGTH;

export const descriptionTooLongEmbed = (description: string): APIEmbed =>
  ({
    title: `利用目的は ${DESCRIPTION_MAX_LENGTH} 文字以内で入力してください`,
    description: `現在 ${
      descriptionLength(description)
    } 文字入力されています\n\`\`\`\n${description}\n\`\`\``,
    color: EmbedColor.Error,
    footer: {
      text: "何度もこのエラーが出る場合、Bot 管理者にお問い合わせください",
    },
  }) satisfies APIEmbed;
