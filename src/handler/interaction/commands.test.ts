import { assertEquals } from "@std/assert";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { resolveCommand } from "./commands.ts";

Deno.test("resolveCommand はサブコマンドグループとサブコマンドを解決する", () => {
  const result = resolveCommand({
    options: [
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: "discord",
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "list",
            options: [],
          },
        ],
      },
    ],
  });
  assertEquals(result?.group, "discord");
  assertEquals(result?.subcommand, "list");
  assertEquals(result?.options.size, 0);
});

Deno.test("resolveCommand はサブコマンドのオプションを Map に格納する", () => {
  const result = resolveCommand({
    options: [
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: "token",
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [
              {
                type: ApplicationCommandOptionType.String,
                name: "token",
                value: "uuid-1",
              },
            ],
          },
        ],
      },
    ],
  });
  assertEquals(result?.group, "token");
  assertEquals(result?.subcommand, "show");
  assertEquals(result?.options.get("token"), "uuid-1");
});

Deno.test("resolveCommand は options が空の場合に null を返す", () => {
  assertEquals(resolveCommand({ options: [] }), null);
  assertEquals(resolveCommand({}), null);
});

Deno.test("resolveCommand はトップレベルがサブコマンドグループでない場合に null を返す", () => {
  const result = resolveCommand({
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "list",
        options: [],
      },
    ],
  });
  assertEquals(result, null);
});

Deno.test("resolveCommand はサブコマンドグループ内にサブコマンドがない場合に null を返す", () => {
  const result = resolveCommand({
    options: [
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: "discord",
        options: [],
      },
    ],
  });
  assertEquals(result, null);
});
