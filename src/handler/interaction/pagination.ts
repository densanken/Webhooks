import {
  type APIMessageTopLevelComponent,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v10";

export const LIST_PAGE_SIZE = 3;

export type Page = {
  index: number;
  count: number;
  start: number;
  end: number;
};

export const getPage = (
  itemCount: number,
  requestedPage: number,
  pageSize = LIST_PAGE_SIZE,
): Page => {
  const count = Math.max(1, Math.ceil(itemCount / pageSize));
  const index = Math.min(Math.max(0, requestedPage), count - 1);
  const start = index * pageSize;

  return {
    index,
    count,
    start,
    end: Math.min(start + pageSize, itemCount),
  };
};

export const createPaginationComponents = (
  customIdPrefix: string,
  page: Page,
): APIMessageTopLevelComponent[] =>
  page.count === 1 ? [] : [{
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: "<<",
        custom_id: `${customIdPrefix}:first:0`,
        disabled: page.index === 0,
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: "<",
        custom_id: `${customIdPrefix}:previous:${page.index - 1}`,
        disabled: page.index === 0,
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: ">",
        custom_id: `${customIdPrefix}:next:${page.index + 1}`,
        disabled: page.index === page.count - 1,
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: ">>",
        custom_id: `${customIdPrefix}:last:${page.count - 1}`,
        disabled: page.index === page.count - 1,
      },
    ],
  }];

export const sortByUpdatedAtDescending = <T extends { updatedAt: string }>(
  items: T[],
): T[] =>
  [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );

export const parseRequestedPage = (
  customId: string,
  customIdPrefix: string,
): number => {
  const value = customId.slice(`${customIdPrefix}:`.length).split(":").at(-1);
  if (value === undefined) {
    return 0;
  }
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) ? page : 0;
};
