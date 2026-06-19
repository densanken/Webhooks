import { parseDiscordWebhookUrl } from "../../../util/discord/webhook-url.ts";
import { hashString } from "../../../util/crypto.ts";
import { WebhookRepositoryConflictError } from "../../error/impl.ts";
import type {
  CreateRegisteredDiscordWebhookInput,
  DiscordRegisteredWebhookRepositoryInterface,
  RegisteredDiscordWebhookRecord,
  RegisteredDiscordWebhookSummaryRecord,
  UpdateRegisteredDiscordWebhookInput,
} from "./interface.ts";
import { toRegisteredDiscordWebhookSummaryRecord } from "./record.ts";

export class MockDiscordRegisteredWebhookRepository
  implements DiscordRegisteredWebhookRepositoryInterface {
  constructor(private records: RegisteredDiscordWebhookRecord[] = []) {}

  async createRegisteredDiscordWebhook(
    input: CreateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookRecord> {
    if (
      this.records.some((record) => record.uuid === input.uuid)
    ) {
      throw new WebhookRepositoryConflictError(
        `Registered Discord webhook already exists: ${input.uuid}`,
      );
    }

    const createdAt = (input.now ?? new Date()).toISOString();
    const webhookUrlSecret = await this.normalizeDiscordWebhookUrl(
      input.discordWebhookUrl,
    );
    const record: RegisteredDiscordWebhookRecord = {
      uuid: input.uuid,
      description: input.description,
      discordWebhookUrl: webhookUrlSecret.url,
      discordWebhookUrlHash: webhookUrlSecret.hash,
      pathToken: input.pathToken,
      createdAt,
      updatedAt: createdAt,
    };

    this.records = [...this.records, record];
    return record;
  }

  listRegisteredDiscordWebhooks(): Promise<
    RegisteredDiscordWebhookSummaryRecord[]
  > {
    return Promise.resolve(
      this.records.map(toRegisteredDiscordWebhookSummaryRecord),
    );
  }

  getRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookRecord | null> {
    return Promise.resolve(
      this.records.find((record) => record.uuid === uuid) ?? null,
    );
  }

  async updateRegisteredDiscordWebhook(
    uuid: string,
    input: UpdateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookSummaryRecord | null> {
    const record = await this.getRegisteredDiscordWebhook(uuid);
    if (record === null) return null;

    const updatedRecord: RegisteredDiscordWebhookRecord = {
      ...record,
      description: input.description,
      updatedAt: (input.now ?? new Date()).toISOString(),
    };
    this.records = this.records.map((record) =>
      record.uuid === uuid ? updatedRecord : record
    );

    return toRegisteredDiscordWebhookSummaryRecord(updatedRecord);
  }

  deleteRegisteredDiscordWebhook(uuid: string): Promise<void> {
    this.records = this.records.filter((record) => record.uuid !== uuid);
    return Promise.resolve();
  }

  private async normalizeDiscordWebhookUrl(
    discordWebhookUrl: string,
  ): Promise<{ url: string; hash: string }> {
    const parsedUrl = parseDiscordWebhookUrl(discordWebhookUrl);

    return {
      url: parsedUrl.url,
      hash: await hashString(parsedUrl.url),
    };
  }
}
