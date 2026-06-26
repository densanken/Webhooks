import { assertEquals } from "@std/assert";
import {
  extractModalValue,
  extractModalValueByPrefix,
} from "./extract-modal-value.ts";
import type { APIModalSubmitInteraction } from "discord-api-types/v10";

const interaction = {
  data: {
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "description:abc123",
            value: "latest value",
          },
        ],
      },
    ],
  },
} as APIModalSubmitInteraction;

Deno.test("extractModalValueByPrefix は nonce 付き custom_id の値を取得する", () => {
  assertEquals(
    extractModalValueByPrefix(interaction, "description:"),
    "latest value",
  );
});

Deno.test("extractModalValue は完全一致しない custom_id を無視する", () => {
  assertEquals(extractModalValue(interaction, "description"), undefined);
});
