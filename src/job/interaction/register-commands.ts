import {
  ApplicationCommandType,
  type RESTPostAPIApplicationGuildCommandsJSONBody,
} from "discord-api-types/v10";
import { discordCommand } from "../../handler/interaction/discord/command/index.ts";
import { tokenCommand } from "../../handler/interaction/token/command/index.ts";

const COMMAND: RESTPostAPIApplicationGuildCommandsJSONBody = {
  name: "webhook",
  description: "Webhook Manager",
  type: ApplicationCommandType.ChatInput,
  options: [discordCommand.definition, tokenCommand.definition],
};

const main = async () => {
  const applicationId = Deno.env.get("DISCORD_APPLICATION_ID")?.trim();
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN")?.trim();
  const allowedGuildIds = (Deno.env.get("DISCORD_ALLOWED_GUILD_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  if (!applicationId || !botToken) {
    console.error(
      "DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set",
    );
    Deno.exit(1);
  }

  if (allowedGuildIds.length === 0) {
    console.error("DISCORD_ALLOWED_GUILD_IDS must be set");
    Deno.exit(1);
  }

  const headers = {
    authorization: `Bot ${botToken}`,
    "content-type": "application/json",
  };

  const globalUrl =
    `https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/commands`;
  const globalResponse = await fetch(globalUrl, { headers });
  if (globalResponse.ok) {
    const globalCommands: { id: string; name: string }[] = await globalResponse
      .json();
    for (const cmd of globalCommands) {
      const deleteResponse = await fetch(`${globalUrl}/${cmd.id}`, {
        method: "DELETE",
        headers,
      });
      await deleteResponse.body?.cancel();
      console.log(`Deleted global command: ${cmd.name} (${cmd.id})`);
    }
  } else {
    await globalResponse.body?.cancel();
  }

  for (const guildId of allowedGuildIds) {
    const url =
      `https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/guilds/${encodeURIComponent(guildId)}/commands`;

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify([COMMAND]),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `Failed to register commands for guild ${guildId}: ${response.status} ${body}`,
      );
      continue;
    }

    await response.body?.cancel();
    console.log(`Registered commands for guild ${guildId}`);
  }
};

if (import.meta.main) {
  await main();
}
