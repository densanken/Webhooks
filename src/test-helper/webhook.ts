export const ENCRYPTION_KEY_ID_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY_ID";
export const ENCRYPTION_KEY_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY";

export const ENV_PERMISSION = {
  env: [ENCRYPTION_KEY_ID_ENV, ENCRYPTION_KEY_ENV],
};

export const VALID_DISCORD_WEBHOOK_ID = "12345678901234567";
export const VALID_DISCORD_WEBHOOK_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";

export const discordWebhookUrl = (
  host: "discord.com" | "discordapp.com" = "discord.com",
): string =>
  `https://${host}/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`;

export const withMemoryKv = async (
  callback: (kv: Deno.Kv) => Promise<void>,
): Promise<void> => {
  const kv = await Deno.openKv(":memory:");

  try {
    await callback(kv);
  } finally {
    kv.close();
  }
};

export const withEncryptionKey = async (
  callback: (env: { kid: string; encodedKey: string }) => Promise<void>,
): Promise<void> => {
  const originalKid = Deno.env.get(ENCRYPTION_KEY_ID_ENV);
  const originalEncodedKey = Deno.env.get(ENCRYPTION_KEY_ENV);
  const kid = `wsk-test-${crypto.randomUUID()}`;
  const encodedKey = new Uint8Array(32).toBase64();

  Deno.env.set(ENCRYPTION_KEY_ID_ENV, kid);
  Deno.env.set(ENCRYPTION_KEY_ENV, encodedKey);

  try {
    await callback({ kid, encodedKey });
  } finally {
    setOrDeleteEnv(ENCRYPTION_KEY_ID_ENV, originalKid);
    setOrDeleteEnv(ENCRYPTION_KEY_ENV, originalEncodedKey);
  }
};

const setOrDeleteEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    Deno.env.delete(key);
    return;
  }

  Deno.env.set(key, value);
};
