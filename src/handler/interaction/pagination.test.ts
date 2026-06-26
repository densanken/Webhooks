import { assert, assertEquals } from "@std/assert";
import { ComponentType } from "discord-api-types/v10";
import {
  createPaginationComponents,
  getPage,
  parseRequestedPage,
  sortByUpdatedAtDescending,
} from "./pagination.ts";

Deno.test("getPage は10件ごとの表示範囲を返す", () => {
  assertEquals(getPage(21, 1, 10), {
    index: 1,
    count: 3,
    start: 10,
    end: 20,
  });
});

Deno.test("getPage は範囲外のページ番号を補正する", () => {
  assertEquals(getPage(26, -1, 10).index, 0);
  assertEquals(getPage(26, 99, 10).index, 2);
});

Deno.test("createPaginationComponents は端のボタンを無効化する", () => {
  const first = createPaginationComponents("list.page", getPage(26, 0, 10));
  const last = createPaginationComponents("list.page", getPage(26, 2, 10));

  assert("components" in first[0]);
  assert("components" in last[0]);
  assert(first[0].components[0].type === ComponentType.Button);
  assert(first[0].components[1].type === ComponentType.Button);
  assert(first[0].components[2].type === ComponentType.Button);
  assert(first[0].components[3].type === ComponentType.Button);
  assert("custom_id" in first[0].components[3]);
  assert(last[0].components[0].type === ComponentType.Button);
  assert("custom_id" in last[0].components[0]);
  assert(last[0].components[1].type === ComponentType.Button);
  assert(last[0].components[2].type === ComponentType.Button);
  assert(last[0].components[3].type === ComponentType.Button);
  assertEquals(first[0].components[0].disabled, true);
  assertEquals(first[0].components[1].disabled, true);
  assertEquals(first[0].components[2].disabled, false);
  assertEquals(first[0].components[3].disabled, false);
  assertEquals(last[0].components[0].disabled, false);
  assertEquals(last[0].components[1].disabled, false);
  assertEquals(last[0].components[2].disabled, true);
  assertEquals(last[0].components[3].disabled, true);
  assertEquals(first[0].components[3].custom_id, "list.page:last:2");
  assertEquals(last[0].components[0].custom_id, "list.page:first:0");
});

Deno.test("createPaginationComponents は1ページのみならボタンを返さない", () => {
  assertEquals(createPaginationComponents("list.page", getPage(10, 0, 10)), []);
});

Deno.test("createPaginationComponents は各ボタンに一意な custom_id を設定する", () => {
  const components = createPaginationComponents("list.page", getPage(4, 0, 2));

  assert("components" in components[0]);
  const customIds = components[0].components.map((component) => {
    assert(component.type === ComponentType.Button);
    assert("custom_id" in component);
    return component.custom_id;
  });

  assertEquals(new Set(customIds).size, customIds.length);
});

Deno.test("parseRequestedPage は custom_id からページ番号を取得する", () => {
  assertEquals(parseRequestedPage("list.page:next:2", "list.page"), 2);
  assertEquals(parseRequestedPage("list.page:2", "list.page"), 2);
  assertEquals(parseRequestedPage("list.page:invalid", "list.page"), 0);
});

Deno.test("sortByUpdatedAtDescending は更新日時の降順で並べる", () => {
  const items = [
    { id: "old", updatedAt: "2026-06-01T00:00:00.000Z" },
    { id: "new", updatedAt: "2026-06-03T00:00:00.000Z" },
    { id: "middle", updatedAt: "2026-06-02T00:00:00.000Z" },
  ];

  assertEquals(
    sortByUpdatedAtDescending(items).map((item) => item.id),
    ["new", "middle", "old"],
  );
  assertEquals(items.map((item) => item.id), ["old", "new", "middle"]);
});
