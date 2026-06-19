export const dynamicWebhookTokenKey = (uuid: string): Deno.KvKey => [
  "token",
  uuid,
];

export const dynamicWebhookTokenPrefix: Deno.KvKey = ["token"];
