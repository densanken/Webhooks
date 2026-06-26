import type {
  APIModalSubmitInteraction,
  ModalSubmitComponent,
} from "discord-api-types/v10";

const findModalComponent = (
  interaction: APIModalSubmitInteraction,
  matchesCustomId: (customId: string) => boolean,
): ModalSubmitComponent | undefined => {
  for (const item of interaction.data.components ?? []) {
    if ("components" in item) {
      const component = item.components.find((component) =>
        matchesCustomId(component.custom_id)
      );
      if (component) return component;
    }

    if (
      "component" in item &&
      matchesCustomId(item.component.custom_id)
    ) {
      return item.component;
    }
  }

  return undefined;
};

export const extractModalValue = (
  interaction: APIModalSubmitInteraction,
  customId: string,
): string | undefined => {
  const component = findModalComponent(
    interaction,
    (componentCustomId) => componentCustomId === customId,
  );
  return component && "value" in component &&
      typeof component.value === "string"
    ? component.value
    : undefined;
};

export const extractModalValueByPrefix = (
  interaction: APIModalSubmitInteraction,
  customIdPrefix: string,
): string | undefined => {
  const component = findModalComponent(
    interaction,
    (componentCustomId) => componentCustomId.startsWith(customIdPrefix),
  );
  return component && "value" in component &&
      typeof component.value === "string"
    ? component.value
    : undefined;
};

export const extractModalBoolean = (
  interaction: APIModalSubmitInteraction,
  customId: string,
): boolean | undefined => {
  const component = findModalComponent(
    interaction,
    (componentCustomId) => componentCustomId === customId,
  );
  return component && "value" in component &&
      typeof component.value === "boolean"
    ? component.value
    : undefined;
};
