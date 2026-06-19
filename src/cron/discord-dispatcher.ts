import { DiscordWebhookSender } from "../infrastructure/discord-webhook-sender/impl.ts";
import { Kv } from "../infrastructure/kv/client.ts";
import { DiscordRateLimitRepository } from "../repository/discord/rate-limit/impl.ts";
import { DiscordQueueRepository } from "../repository/discord/queue/impl.ts";
import { DiscordDispatchUseCase } from "../usecase/discord/dispatch/impl.ts";
import type { DispatchPendingInput } from "../usecase/discord/dispatch/interface.ts";
import { notifyDeadLetterMessages } from "./dead-letter-notifier.ts";

export const DISCORD_DISPATCHER_CRON_NAME = "dispatch-discord-webhooks";
export const DISCORD_DISPATCHER_CRON_SCHEDULE = "0 7,19 * * *";

type EnvReader = (name: string) => string | undefined;

// 整数の環境変数を読み取り、未設定・空文字・非整数値および `minimum` 未満の値は無視する
// `minimum` は設定ごとに異なる: ディスパッチ上限 (一時停止) や送信間隔 (遅延なし) では
// `0` が有効だが、最大試行回数の `0` は意味をなさないのでユースケースのデフォルトに任せる
const readIntEnv = (
  name: string,
  readEnv: EnvReader,
  minimum: number,
): number | undefined => {
  const raw = readEnv(name);
  if (raw === undefined || raw.trim() === "") return undefined;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) return undefined;

  return value;
};

export const resolveNotificationWebhookUrl = (
  readEnv: EnvReader = (name) => Deno.env.get(name),
): string | undefined => {
  const url = readEnv("DEAD_LETTER_NOTIFICATION_DISCORD_WEBHOOK_URL")?.trim();
  return url || undefined;
};

export const resolveDispatchPendingInput = (
  readEnv: EnvReader = (name) => Deno.env.get(name),
): DispatchPendingInput => {
  const input: DispatchPendingInput = {};

  const limit = readIntEnv("DISPATCH_MAX_MESSAGES_PER_RUN", readEnv, 0);
  if (limit !== undefined) input.limit = limit;

  const sendIntervalMs = readIntEnv("DISPATCH_INTERVAL_MS", readEnv, 0);
  if (sendIntervalMs !== undefined) input.sendIntervalMs = sendIntervalMs;

  const maxAttempts = readIntEnv("DISPATCH_MAX_ATTEMPTS", readEnv, 1);
  if (maxAttempts !== undefined) input.maxAttempts = maxAttempts;

  return input;
};

export const dispatchDiscordWebhookMessages = async (): Promise<void> => {
  try {
    const kv = await Kv.getKv();
    const queueRepository = new DiscordQueueRepository(kv);
    const rateLimitRepository = new DiscordRateLimitRepository(kv);
    const sender = new DiscordWebhookSender();

    const dispatcher = new DiscordDispatchUseCase({
      queueRepository,
      rateLimitRepository,
      sender,
    });

    const result = await dispatcher.dispatchPendingDiscordWebhookMessages(
      resolveDispatchPendingInput(),
    );

    // 集計カウンターのみをログ出力する (Webhook の秘密情報は含まれない)
    console.log(
      `[cron:${DISCORD_DISPATCHER_CRON_NAME}] scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} retried=${result.retried} rateLimited=${result.rateLimited} dead=${result.dead}`,
    );

    const notificationWebhookUrl = resolveNotificationWebhookUrl();
    const deadMessagesToNotify = result.deadMessages.filter(
      (m) => m.sourceType !== "system",
    );
    if (notificationWebhookUrl && deadMessagesToNotify.length > 0) {
      try {
        await notifyDeadLetterMessages(deadMessagesToNotify, {
          notificationWebhookUrl,
          queueRepository,
          rateLimitRepository,
          sender,
        });
      } catch (error) {
        console.error(
          `[cron:${DISCORD_DISPATCHER_CRON_NAME}] dead-letter notification failed: ${
            error instanceof Error ? error.name : "unknown error"
          }`,
        );
      }
    }
  } catch (error) {
    // Webhook の秘密情報を漏らさないよう、エラー名だけをログ出力する
    // 機密データを含む可能性があるメッセージやスタックは出力しない
    // 一時的な障害で cron がクラッシュしないよう例外を飲み込み、
    // 保留中のメッセージはキューに残して次回実行時にリトライする
    console.error(
      `[cron:${DISCORD_DISPATCHER_CRON_NAME}] dispatch run failed: ${
        error instanceof Error ? error.name : "unknown error"
      }`,
    );
  }
};

// `Deno.cron` は Deno Deploy およびローカルの `--unstable-cron` 環境でのみ利用可能
// このモジュールのインポートが他の環境 (特に `Deno.cron` が未定義の `deno test`) で
// 副作用を起こさないよう登録をガードする
if (typeof Deno.cron === "function") {
  Deno.cron(
    DISCORD_DISPATCHER_CRON_NAME,
    DISCORD_DISPATCHER_CRON_SCHEDULE,
    dispatchDiscordWebhookMessages,
  );
}
