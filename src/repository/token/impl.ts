import { assertAtomicCommit } from "../error/atomic.ts";
import {
  dynamicWebhookTokenKey,
  dynamicWebhookTokenPrefix,
} from "../../infrastructure/kv/token-key.ts";
import { WebhookRepositoryConflictError } from "../error/impl.ts";
import { assertBearerToken, hashString } from "../../util/crypto.ts";
import type {
  CreateWebhookTokenInput,
  UpdateWebhookTokenInput,
  WebhookTokenRecord,
  WebhookTokenRepositoryInterface,
} from "./interface.ts";
import { createWebhookTokenRecord } from "./record.ts";

export class WebhookTokenRepository implements WebhookTokenRepositoryInterface {
  constructor(private readonly kv: Deno.Kv) {}

  async createDynamicWebhookToken(
    input: CreateWebhookTokenInput,
  ): Promise<WebhookTokenRecord> {
    assertBearerToken(input.token);

    const key = dynamicWebhookTokenKey(input.uuid);
    const createdAt = (input.now ?? new Date()).toISOString();
    const record = createWebhookTokenRecord({
      uuid: input.uuid,
      description: input.description,
      tokenHash: await hashString(input.token),
      createdAt,
      updatedAt: createdAt,
      owner: input.owner,
    });

    const result = await this.kv.atomic()
      .check({ key, versionstamp: null })
      .set(key, record)
      .commit();

    if (!result.ok) {
      throw new WebhookRepositoryConflictError(
        `Dynamic webhook token already exists: ${input.uuid}`,
      );
    }

    return record;
  }

  async listDynamicWebhookTokens(): Promise<WebhookTokenRecord[]> {
    const records: WebhookTokenRecord[] = [];
    const entries = this.kv.list<WebhookTokenRecord>({
      prefix: dynamicWebhookTokenPrefix,
    });

    for await (const entry of entries) {
      records.push(entry.value);
    }

    return records;
  }

  async getDynamicWebhookToken(
    uuid: string,
  ): Promise<WebhookTokenRecord | null> {
    const entry = await this.kv.get<WebhookTokenRecord>(
      dynamicWebhookTokenKey(uuid),
    );

    return entry.value;
  }

  async updateDynamicWebhookToken(
    uuid: string,
    input: UpdateWebhookTokenInput,
  ): Promise<WebhookTokenRecord | null> {
    const key = dynamicWebhookTokenKey(uuid);
    const entry = await this.kv.get<WebhookTokenRecord>(key);
    if (entry.value === null) return null;

    const updatedRecord = createWebhookTokenRecord({
      ...entry.value,
      description: input.description === undefined
        ? entry.value.description
        : input.description,
      updatedAt: (input.now ?? new Date()).toISOString(),
      owner: input.owner === undefined ? entry.value.owner : input.owner,
    });

    assertAtomicCommit(
      await this.kv.atomic()
        .check({ key, versionstamp: entry.versionstamp })
        .set(key, updatedRecord)
        .commit(),
      `Failed to update dynamic webhook token: ${uuid}`,
    );

    return updatedRecord;
  }

  async deleteDynamicWebhookToken(uuid: string): Promise<void> {
    await this.kv.delete(dynamicWebhookTokenKey(uuid));
  }
}
