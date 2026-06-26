import { WebhookRepositoryConflictError } from "../error/impl.ts";
import { assertBearerToken, hashString } from "../../util/crypto.ts";
import type {
  CreateWebhookTokenInput,
  UpdateWebhookTokenInput,
  WebhookTokenRecord,
  WebhookTokenRepositoryInterface,
} from "./interface.ts";
import { createWebhookTokenRecord } from "./record.ts";

export class MockWebhookTokenRepository
  implements WebhookTokenRepositoryInterface {
  constructor(private records: WebhookTokenRecord[] = []) {}

  async createDynamicWebhookToken(
    input: CreateWebhookTokenInput,
  ): Promise<WebhookTokenRecord> {
    assertBearerToken(input.token);

    if (this.records.some((record) => record.uuid === input.uuid)) {
      throw new WebhookRepositoryConflictError(
        `Dynamic webhook token already exists: ${input.uuid}`,
      );
    }

    const createdAt = (input.now ?? new Date()).toISOString();
    const record = createWebhookTokenRecord({
      uuid: input.uuid,
      description: input.description,
      tokenHash: await hashString(input.token),
      createdAt,
      updatedAt: createdAt,
      owner: input.owner,
    });

    this.records = [...this.records, record];
    return record;
  }

  listDynamicWebhookTokens(): Promise<WebhookTokenRecord[]> {
    return Promise.resolve([...this.records]);
  }

  getDynamicWebhookToken(
    uuid: string,
  ): Promise<WebhookTokenRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.uuid === uuid) ?? null,
    );
  }

  async updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ): Promise<WebhookTokenRecord | null> {
    const record = await this.getDynamicWebhookToken(uuid);
    if (record === null) return null;

    const updatedRecord = createWebhookTokenRecord({
      ...record,
      description: input.description === undefined
        ? record.description
        : input.description,
      owner: input.owner === undefined ? record.owner : input.owner,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });
    this.records = this.records.map((record) =>
      record.uuid === uuid ? updatedRecord : record
    );

    return updatedRecord;
  }

  deleteDynamicWebhookToken(uuid: string): Promise<void> {
    this.records = this.records.filter((record) => record.uuid !== uuid);
    return Promise.resolve();
  }
}
