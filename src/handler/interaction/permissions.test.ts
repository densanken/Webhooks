import { assertEquals } from "@std/assert";
import { PermissionFlagsBits } from "discord-api-types/v10";
import {
  isAdmin,
  isAllowedGuild,
  isGuildMatch,
  isOwner,
} from "./permissions.ts";

Deno.test("isAllowedGuild は許可されたギルド ID で true を返す", () => {
  assertEquals(isAllowedGuild("guild1", ["guild1", "guild2"]), true);
});

Deno.test("isAllowedGuild は許可されていないギルド ID で false を返す", () => {
  assertEquals(isAllowedGuild("guild3", ["guild1", "guild2"]), false);
});

Deno.test("isAllowedGuild は undefined で false を返す", () => {
  assertEquals(isAllowedGuild(undefined, ["guild1"]), false);
});

Deno.test("isAdmin は Administrator 権限で true を返す", () => {
  assertEquals(isAdmin(String(PermissionFlagsBits.Administrator)), true);
});

Deno.test("isAdmin は Administrator を含む複合権限で true を返す", () => {
  const combined = BigInt(PermissionFlagsBits.Administrator) |
    BigInt(PermissionFlagsBits.SendMessages);
  assertEquals(isAdmin(String(combined)), true);
});

Deno.test("isAdmin は Administrator を含まない権限で false を返す", () => {
  assertEquals(isAdmin(String(PermissionFlagsBits.SendMessages)), false);
});

Deno.test("isAdmin は undefined で false を返す", () => {
  assertEquals(isAdmin(undefined), false);
});

Deno.test("isOwner は一致する ID で true を返す", () => {
  assertEquals(isOwner("user1", "user1"), true);
});

Deno.test("isOwner は異なる ID で false を返す", () => {
  assertEquals(isOwner("user1", "user2"), false);
});

Deno.test("isOwner は undefined で false を返す", () => {
  assertEquals(isOwner("user1", undefined), false);
});

Deno.test("isGuildMatch は一致するギルド ID で true を返す", () => {
  assertEquals(isGuildMatch("guild1", "guild1"), true);
});

Deno.test("isGuildMatch は異なるギルド ID で false を返す", () => {
  assertEquals(isGuildMatch("guild1", "guild2"), false);
});

Deno.test("isGuildMatch は undefined で false を返す", () => {
  assertEquals(isGuildMatch("guild1", undefined), false);
});
