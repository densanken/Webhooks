export const verifyDiscordSignature = async (
  publicKeyHex: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> => {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      Uint8Array.fromHex(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );

    const signatureBytes = Uint8Array.fromHex(signature);
    const message = new TextEncoder().encode(timestamp + body);

    return await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      signatureBytes,
      message,
    );
  } catch {
    return false;
  }
};
