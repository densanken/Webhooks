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

  const response = await fetch(followupUrl(applicationId, interactionToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Discord followup failed: ${response.status} ${response.statusText}`,
    );
  }
};

export const sendFollowupEmbed = async (
  applicationId: string,
  interactionToken: string,
  embed: APIEmbed,
): Promise<void> => {
  const response = await fetch(followupUrl(applicationId, interactionToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Discord followup failed: ${response.status} ${response.statusText}`,
    );
  }
};
