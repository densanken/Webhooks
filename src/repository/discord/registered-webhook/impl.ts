import { assertAtomicCommit } from "../../error/atomic.ts";
import {
  registeredDiscordWebhookKey,
  registeredDiscordWebhookPrefix,
} from "../../../infrastructure/kv/discord-key.ts";
import {
  normalizeAndEncryptDiscordWebhookUrl,
  registeredDiscordWebhookUrlLabel,
  registeredWebhookPathTokenLabel,
} from "../../../infrastructure/discord-webhook-secret.ts";
import { WebhookRepositoryConflictError } from "../../error/impl.ts";
import { encryptString } from "../../../util/crypto.ts";
import type {
  CreateRegisteredDiscordWebhookInput,
  DiscordRegisteredWebhookRepositoryInterface,
  RegisteredDiscordWebhookRecord,
  RegisteredDiscordWebhookSummaryRecord,
  UpdateRegisteredDiscordWebhookInput,
} from "./interface.ts";
import {
  createRegisteredDiscordWebhookKvRecord,
  type RegisteredDiscordWebhookKvRecord,
  toRegisteredDiscordWebhookRecord,
  toRegisteredDiscordWebhookSummaryRecord,
} from "./record.ts";
import {
  decryptRegisteredDiscordWebhookUrl,
  decryptRegisteredPathToken,
} from "./secret.ts";

export class DiscordRegisteredWebhookRepository
  implements DiscordRegisteredWebhookRepositoryInterface {
  constructor(private readonly kv: Deno.Kv) {}

  async createRegisteredDiscordWebhook(
    input: CreateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookRecord> {
    const key = registeredDiscordWebhookKey(input.uuid);
    const createdAt = (input.now ?? new Date()).toISOString();
    const webhookUrlSecret = await normalizeAndEncryptDiscordWebhookUrl(
      registeredDiscordWebhookUrlLabel(input.uuid),
      input.discordWebhookUrl,
    );
    const encryptedPathToken = await encryptString(
      registeredWebhookPathTokenLabel(input.uuid),
      input.pathToken,
    );
    const record = createRegisteredDiscordWebhookKvRecord({
      uuid: input.uuid,
      description: input.description,
      encryptedDiscordWebhookUrl: webhookUrlSecret.encryptedUrl,
      discordWebhookUrlHash: webhookUrlSecret.hash,
      encryptedPathToken,
      createdAt,
      updatedAt: createdAt,
    });

    const result = await this.kv.atomic()
      .check({ key, versionstamp: null })
      .set(key, record)
      .commit();

    if (!result.ok) {
      throw new WebhookRepositoryConflictError(
        `Registered Discord webhook already exists: ${input.uuid}`,
      );
    }

    return toRegisteredDiscordWebhookRecord({
      record,
      discordWebhookUrl: webhookUrlSecret.url,
      pathToken: input.pathToken,
    });
  }

  async listRegisteredDiscordWebhooks(): Promise<
    RegisteredDiscordWebhookSummaryRecord[]
  > {
    const records: RegisteredDiscordWebhookSummaryRecord[] = [];
    const entries = this.kv.list<RegisteredDiscordWebhookKvRecord>({
      prefix: registeredDiscordWebhookPrefix,
    });

    for await (const entry of entries) {
      records.push(toRegisteredDiscordWebhookSummaryRecord(entry.value));
    }

    return records;
  }

  async getRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookRecord | null> {
    const entry = await this.kv.get<RegisteredDiscordWebhookKvRecord>(
      registeredDiscordWebhookKey(uuid),
    );
    if (entry.value === null) return null;

    const [discordWebhookUrl, pathToken] = await Promise.all([
      decryptRegisteredDiscordWebhookUrl(entry.value),
      decryptRegisteredPathToken(entry.value),
    ]);

    return toRegisteredDiscordWebhookRecord({
      record: entry.value,
      discordWebhookUrl,
      pathToken,
    });
  }

  async updateRegisteredDiscordWebhook(
    uuid: string,
    input: UpdateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookSummaryRecord | null> {
    const key = registeredDiscordWebhookKey(uuid);
    const entry = await this.kv.get<RegisteredDiscordWebhookKvRecord>(key);
    if (entry.value === null) return null;

    const updatedRecord = createRegisteredDiscordWebhookKvRecord({
      ...entry.value,
      description: input.description,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });

    assertAtomicCommit(
      await this.kv.atomic()
        .check({ key, versionstamp: entry.versionstamp })
        .set(key, updatedRecord)
        .commit(),
      `Failed to update registered Discord webhook: ${uuid}`,
    );

    return toRegisteredDiscordWebhookSummaryRecord(updatedRecord);
  }

  async deleteRegisteredDiscordWebhook(uuid: string): Promise<void> {
    await this.kv.delete(registeredDiscordWebhookKey(uuid));
  }
}
