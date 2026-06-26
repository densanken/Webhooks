import { type APIEmbed, MessageFlags } from "discord-api-types/v10";
import { EmbedColor } from "../../../handler/interaction/response.ts";

const followupUrl = (applicationId: string, interactionToken: string) =>
  `https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${
    encodeURIComponent(interactionToken)
  }`;

export const sendFollowup = async (
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> => {
  const embed: APIEmbed = {
    description: content,
    color: EmbedColor.Default,
  };

  await fetch(followupUrl(applicationId, interactionToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    }),
  });
};

export const sendFollowupEmbed = async (
  applicationId: string,
  interactionToken: string,
  embed: APIEmbed,
): Promise<void> => {
  await fetch(followupUrl(applicationId, interactionToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    }),
  });
};
