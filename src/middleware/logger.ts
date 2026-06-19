import { logger } from "hono/logger";

// 登録済み公開 Webhook URL では、パスの最後のセグメントがトークンになる
// (`/discord/webhooks/:uuid/:token`)
// トークンは秘密情報なのでログ出力前に秘匿化する
const WEBHOOK_TOKEN_LOG_PATTERN = /(\/discord\/webhooks\/[^/\s]+\/)[^/\s]+/g;

export const redactSecretsInLog = (message: string): string =>
  message.replace(WEBHOOK_TOKEN_LOG_PATTERN, "$1<redacted>");

export const redactingLogger = () =>
  logger((message: string, ...rest: string[]) => {
    console.log(redactSecretsInLog(message), ...rest);
  });
