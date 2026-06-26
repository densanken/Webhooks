import {
  type APIEmbed,
  type APIInteractionResponse,
  type APIInteractionResponseChannelMessageWithSource,
  type APIInteractionResponseDeferredChannelMessageWithSource,
  type APIInteractionResponsePong,
  type APIMessageTopLevelComponent,
  type APIModalInteractionResponse,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";

export const EmbedColor = {
  Default: 0x5865f2,
  Success: 0x57f287,
  Error: 0xed4245,
} as const;

export const pongResponse = (): APIInteractionResponsePong => ({
  type: InteractionResponseType.Pong,
});

export const ephemeralMessage = (
  embed: APIEmbed,
): APIInteractionResponseChannelMessageWithSource => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  },
});

export const ephemeralEmbed = (
  embed: APIEmbed,
  components?: APIMessageTopLevelComponent[],
): APIInteractionResponseChannelMessageWithSource => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    components,
  },
});

export const updateFromEmbed = (
  embed: APIEmbed,
  components: APIMessageTopLevelComponent[] = [],
): APIInteractionResponse => ({
  type: InteractionResponseType.UpdateMessage,
  data: {
    content: "",
    embeds: [embed],
    components,
  },
});

export const deferredEphemeral =
  (): APIInteractionResponseDeferredChannelMessageWithSource => ({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
    },
  });

export const modalResponse = (
  modal: APIModalInteractionResponse["data"],
): APIModalInteractionResponse => ({
  type: InteractionResponseType.Modal,
  data: modal,
});
