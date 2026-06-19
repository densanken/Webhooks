import type { DiscordQueueRepositoryInterface } from "../../../repository/discord/queue/interface.ts";
import type { DiscordRateLimitRepositoryInterface } from "../../../repository/discord/rate-limit/interface.ts";
import type { DiscordSender } from "../sender/interface.ts";

export type DiscordDispatchUseCaseOptions = {
  queueRepository: DiscordQueueRepositoryInterface;
  rateLimitRepository: DiscordRateLimitRepositoryInterface;
  sender: DiscordSender;
  generateClaimId?: () => string;
  getNow?: () => Date;
  wait?: (milliseconds: number) => Promise<void>;
};
