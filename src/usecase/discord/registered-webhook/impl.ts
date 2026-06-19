import type {
  DiscordRegisteredWebhookRepositoryInterface,
  RegisteredDiscordWebhookRecord,
} from "../../../repository/discord/registered-webhook/interface.ts";
import { generateToken } from "../../../util/crypto.ts";
import { WebhookRepositoryConflictError } from "../../../repository/error/impl.ts";
import { InvalidDiscordWebhookUrlError } from "../../../util/discord/webhook-url.ts";
import {
  invalidDiscordWebhookUrlError,
  notFoundError,
} from "../../error/factory.ts";
import type {
  CreateRegisteredDiscordWebhookInput,
  DiscordRegisteredWebhookUseCaseInterface,
  RegisteredDiscordWebhookDetail,
  RegisteredDiscordWebhookUseCaseOptions,
  UpdateRegisteredDiscordWebhookInput,
} from "./interface.ts";
import {
  toRegisteredDiscordWebhookDetail,
  toRegisteredDiscordWebhookSummary,
} from "./mapper.ts";

export class DiscordRegisteredWebhookUseCase
  implements DiscordRegisteredWebhookUseCaseInterface {
  private readonly publicBaseUrl?: string;
  private readonly generateUuid: () => string;
  private readonly generateToken: () => string;

  constructor(
    private readonly repository: DiscordRegisteredWebhookRepositoryInterface,
    options: RegisteredDiscordWebhookUseCaseOptions = {},
  ) {
    this.publicBaseUrl = options.publicBaseUrl;
    this.generateUuid = options.generateUuid ?? (() => crypto.randomUUID());
    this.generateToken = options.generateToken ?? generateToken;
  }

  async createRegisteredDiscordWebhook(
    input: CreateRegisteredDiscordWebhookInput,
  ): Promise<RegisteredDiscordWebhookDetail> {
    const pathToken = this.generateToken();

    const attemptCreate = () =>
      this.repository.createRegisteredDiscordWebhook({
        uuid: this.generateUuid(),
        description: input.description,
        discordWebhookUrl: input.discordWebhookUrl,
        pathToken,
        now: input.now,
      });

    let record: RegisteredDiscordWebhookRecord;
    try {
      record = await attemptCreate();
    } catch (error) {
      if (error instanceof InvalidDiscordWebhookUrlError) {
        throw invalidDiscordWebhookUrlError(error.message);
      }
      if (!(error instanceof WebhookRepositoryConflictError)) {
        throw error;
      }
      record = await attemptCreate();
    }

    return toRegisteredDiscordWebhookDetail({
      record,
      publicBaseUrl: this.publicBaseUrl,
    });
  }

  async listRegisteredDiscordWebhooks() {
    return (await this.repository.listRegisteredDiscordWebhooks()).map(
      toRegisteredDiscordWebhookSummary,
    );
  }

  async getRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookDetail | null> {
    const record = await this.repository.getRegisteredDiscordWebhook(uuid);
    if (record === null) return null;

    return toRegisteredDiscordWebhookDetail({
      record,
      publicBaseUrl: this.publicBaseUrl,
    });
  }

  async requireRegisteredDiscordWebhook(
    uuid: string,
  ): Promise<RegisteredDiscordWebhookDetail> {
    const detail = await this.getRegisteredDiscordWebhook(uuid);
    if (detail === null) {
      throw notFoundError(`Registered Discord webhook not found: ${uuid}`);
    }

    return detail;
  }

  async updateRegisteredDiscordWebhook(
    uuid: string,
    input: UpdateRegisteredDiscordWebhookInput,
  ) {
    const record = await this.repository.updateRegisteredDiscordWebhook(
      uuid,
      { description: input.description, now: input.now },
    );
    if (record === null) return null;

    return toRegisteredDiscordWebhookSummary(record);
  }

  async revokeRegisteredDiscordWebhook(uuid: string): Promise<boolean> {
    const record = await this.repository.getRegisteredDiscordWebhook(uuid);
    if (record === null) return false;

    await this.repository.deleteRegisteredDiscordWebhook(uuid);
    return true;
  }
}
