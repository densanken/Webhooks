import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertRejects,
} from "@std/assert";

import {
  decryptString,
  encryptString,
  generateToken,
  hashString,
  timingSafeIncludes,
  verifyBearerTokenHash,
} from "./crypto.ts";

const ENCRYPTION_KEY_ID_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY_ID";
const ENCRYPTION_KEY_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY";

const ENV_PERMISSION = {
  env: [ENCRYPTION_KEY_ID_ENV, ENCRYPTION_KEY_ENV],
};

const VALID_DISCORD_WEBHOOK_ID = "12345678901234567";
const VALID_DISCORD_WEBHOOK_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";

const testWithEnv = (name: string, fn: () => Promise<void>): void => {
  Deno.test({
    name,
    permissions: ENV_PERMISSION,
    fn,
  });
};

Deno.test(
  "generateToken は 32 バイトの乱数をパディングなしの base64url トークンとして返す",
  () => {
    const token = generateToken();
    const anotherToken = generateToken();

    assertEquals(token.length, 43);
    assertMatch(token, /^[A-Za-z0-9_-]{43}$/);
    assert(!token.startsWith("whsec_"));
    assertNotEquals(token, anotherToken);
  },
);

Deno.test("hashString は決定的な SHA-256 の 16 進文字列を返す", async () => {
  const hash = await hashString("hello");

  assertEquals(hash.length, 64);
  assertMatch(hash, /^[0-9a-f]{64}$/);
  assertEquals(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
  assertEquals(await hashString("hello"), hash);
  assertNotEquals(await hashString("Hello"), hash);
});

Deno.test(
  "verifyBearerTokenHash は生成済み Bearer トークンと保存済み SHA-256 ハッシュを受け入れる",
  async () => {
    const token = generateToken();
    const hash = await hashString(token);

    assertEquals(await verifyBearerTokenHash(token, hash), true);
  },
);

Deno.test("verifyBearerTokenHash は誤ったトークンを拒否する", async () => {
  const token = generateToken();
  const wrongToken = generateToken();
  const hash = await hashString(token);

  assertEquals(await verifyBearerTokenHash(wrongToken, hash), false);
});

Deno.test(
  "verifyBearerTokenHash はハッシュ比較の前にトークン形式でない入力を拒否する",
  async () => {
    const token = generateToken();
    const hash = await hashString(token);

    assertEquals(await verifyBearerTokenHash("secret", hash), false);
    assertEquals(await verifyBearerTokenHash(`${token}=`, hash), false);
    assertEquals(await verifyBearerTokenHash(token.slice(1), hash), false);
    assertEquals(await verifyBearerTokenHash(`${token}!`, hash), false);
  },
);

Deno.test(
  "verifyBearerTokenHash は無効な保存済みハッシュ値を拒否する",
  async () => {
    const token = generateToken();
    const hash = await hashString(token);

    assertEquals(await verifyBearerTokenHash(token, `${hash}00`), false);
    assertEquals(await verifyBearerTokenHash(token, hash.slice(1)), false);
    assertEquals(await verifyBearerTokenHash(token, "x".repeat(64)), false);
  },
);

testWithEnv(
  "encryptString と decryptString は AES-GCM、キー ID、バージョン、AAD ラベル付きで往復変換できる",
  async () => {
    await withEncryptionKey(async ({ kid }) => {
      const label = "webhook-url:secret-uuid-1";
      const plaintext =
        `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`;

      const encrypted = await encryptString(label, plaintext);

      assertEquals(encrypted.v, "v202606");
      assertEquals(encrypted.alg, "AES-GCM");
      assertEquals(encrypted.kid, kid);
      assertEquals(Uint8Array.fromBase64(encrypted.iv).byteLength, 12);
      assert(Uint8Array.fromBase64(encrypted.data).byteLength >= 16);
      assertNotEquals(encrypted.data, plaintext);

      assertEquals(await decryptString(label, encrypted), plaintext);
    });
  },
);

testWithEnv(
  "encryptString は毎回新しい IV を使うため同じ平文でも暗号文が変わる",
  async () => {
    await withEncryptionKey(async () => {
      const label = "webhook-url:secret-uuid-1";
      const plaintext =
        `https://discord.com/api/webhooks/${VALID_DISCORD_WEBHOOK_ID}/${VALID_DISCORD_WEBHOOK_TOKEN}`;

      const first = await encryptString(label, plaintext);
      const second = await encryptString(label, plaintext);

      assertNotEquals(first.iv, second.iv);
      assertNotEquals(first.data, second.data);

      assertEquals(await decryptString(label, first), plaintext);
      assertEquals(await decryptString(label, second), plaintext);
    });
  },
);

testWithEnv(
  "encryptString は暗号化キー ID が未設定の場合に拒否する",
  async () => {
    await withEncryptionEnv(
      { kid: undefined, encodedKey: generateBase64Key() },
      async () => {
        await assertRejects(
          () => encryptString("label", "secret-value"),
          Error,
          `${ENCRYPTION_KEY_ID_ENV} must be set`,
        );
      },
    );
  },
);

testWithEnv("encryptString は暗号化キーが未設定の場合に拒否する", async () => {
  await withEncryptionEnv(
    { kid: "wsk-test", encodedKey: undefined },
    async () => {
      await assertRejects(
        () => encryptString("label", "secret-value"),
        Error,
        `${ENCRYPTION_KEY_ENV} must be set`,
      );
    },
  );
});

testWithEnv(
  "encryptString は 32 バイトにならない暗号化キーを拒否する",
  async () => {
    await withEncryptionEnv(
      {
        kid: "wsk-test",
        encodedKey: new Uint8Array(31).toBase64(),
      },
      async () => {
        await assertRejects(
          () => encryptString("label", "secret-value"),
          Error,
          `${ENCRYPTION_KEY_ENV} must decode to 32 bytes`,
        );
      },
    );
  },
);

testWithEnv(
  "encryptString は無効な base64 の暗号化キーを拒否する",
  async () => {
    await withEncryptionEnv(
      {
        kid: "wsk-test",
        encodedKey: "not base64!",
      },
      async () => {
        await assertRejects(
          () => encryptString("label", "secret-value"),
          Error,
          `Invalid base64: ${ENCRYPTION_KEY_ENV}`,
        );
      },
    );
  },
);

testWithEnv("decryptString は異なる AAD ラベルを拒否する", async () => {
  await withEncryptionKey(async () => {
    const encrypted = await encryptString(
      "webhook-url:secret-uuid-1",
      "secret-value",
    );

    await assertRejects(
      () => decryptString("webhook-url:secret-uuid-2", encrypted),
      Error,
    );
  });
});

testWithEnv(
  "decryptString は未対応の暗号化バージョンを拒否する",
  async () => {
    await withEncryptionKey(async () => {
      const encrypted = await encryptString("label", "secret-value");

      await assertRejects(
        () =>
          decryptString("label", {
            ...encrypted,
            v: "v999999" as "v202606",
          }),
        Error,
        "Unsupported encrypted string version",
      );
    });
  },
);

testWithEnv(
  "decryptString は未対応のアルゴリズムを拒否する",
  async () => {
    await withEncryptionKey(async () => {
      const encrypted = await encryptString("label", "secret-value");

      await assertRejects(
        () =>
          decryptString("label", {
            ...encrypted,
            alg: "AES-CTR" as "AES-GCM",
          }),
        Error,
        "Unsupported encryption algorithm",
      );
    });
  },
);

testWithEnv(
  "decryptString は未対応のキー ID を拒否する",
  async () => {
    await withEncryptionKey(async () => {
      const encrypted = await encryptString("label", "secret-value");

      await assertRejects(
        () =>
          decryptString("label", {
            ...encrypted,
            kid: "wsk-unknown",
          }),
        Error,
        "Unsupported encryption key id",
      );
    });
  },
);

testWithEnv("decryptString は無効な base64 フィールドを拒否する", async () => {
  await withEncryptionKey(async () => {
    const encrypted = await encryptString("label", "secret-value");

    await assertRejects(
      () =>
        decryptString("label", {
          ...encrypted,
          iv: "not base64!",
        }),
      Error,
      "Invalid base64: iv",
    );

    await assertRejects(
      () =>
        decryptString("label", {
          ...encrypted,
          data: "not base64!",
        }),
      Error,
      "Invalid base64: data",
    );
  });
});

testWithEnv("decryptString は無効な IV 長を拒否する", async () => {
  await withEncryptionKey(async () => {
    const encrypted = await encryptString("label", "secret-value");

    await assertRejects(
      () =>
        decryptString("label", {
          ...encrypted,
          iv: new Uint8Array(11).toBase64(),
        }),
      Error,
      "Invalid AES-GCM IV length",
    );
  });
});

testWithEnv(
  "decryptString は AES-GCM タグより短い暗号化データを拒否する",
  async () => {
    await withEncryptionKey(async () => {
      const encrypted = await encryptString("label", "secret-value");

      await assertRejects(
        () =>
          decryptString("label", {
            ...encrypted,
            data: new Uint8Array(15).toBase64(),
          }),
        Error,
        "Invalid encrypted data",
      );
    });
  },
);

testWithEnv("decryptString は改ざんされた暗号文バイトを拒否する", async () => {
  await withEncryptionKey(async () => {
    const encrypted = await encryptString("label", "secret-value");

    const modifiedData = Uint8Array.fromBase64(encrypted.data, {
      lastChunkHandling: "strict",
    });
    modifiedData[0] ^= 0xff;

    await assertRejects(() =>
      decryptString("label", {
        ...encrypted,
        data: modifiedData.toBase64(),
      })
    );
  });
});

testWithEnv(
  "decryptString は改ざんされた認証タグバイトを拒否する",
  async () => {
    await withEncryptionKey(async () => {
      const encrypted = await encryptString("label", "secret-value");

      const modifiedData = Uint8Array.fromBase64(encrypted.data, {
        lastChunkHandling: "strict",
      });
      modifiedData[modifiedData.byteLength - 1] ^= 0xff;

      await assertRejects(() =>
        decryptString("label", {
          ...encrypted,
          data: modifiedData.toBase64(),
        })
      );
    });
  },
);

Deno.test("timingSafeIncludes は候補リスト内の値と一致する", () => {
  assertEquals(
    timingSafeIncludes(["alpha", "bravo", "charlie"], "bravo"),
    true,
  );
  assertEquals(
    timingSafeIncludes(["alpha", "bravo", "charlie"], "delta"),
    false,
  );
});

Deno.test("timingSafeIncludes はバイト長が異なる値を拒否する", () => {
  assertEquals(timingSafeIncludes(["short"], "short-but-longer"), false);
  assertEquals(timingSafeIncludes(["long-candidate"], "short"), false);
});

Deno.test("timingSafeIncludes は空の候補リストに対して false を返す", () => {
  assertEquals(timingSafeIncludes([], "anything"), false);
});

const withEncryptionKey = async (
  callback: (env: { kid: string; encodedKey: string }) => Promise<void>,
): Promise<void> => {
  await withEncryptionEnv(
    {
      kid: `wsk-test-${crypto.randomUUID()}`,
      encodedKey: generateBase64Key(),
    },
    callback,
  );
};

const withEncryptionEnv = async (
  env: {
    kid: string | undefined;
    encodedKey: string | undefined;
  },
  callback: (env: { kid: string; encodedKey: string }) => Promise<void>,
): Promise<void> => {
  const originalKid = Deno.env.get(ENCRYPTION_KEY_ID_ENV);
  const originalEncodedKey = Deno.env.get(ENCRYPTION_KEY_ENV);

  setOrDeleteEnv(ENCRYPTION_KEY_ID_ENV, env.kid);
  setOrDeleteEnv(ENCRYPTION_KEY_ENV, env.encodedKey);

  try {
    await callback({
      kid: env.kid ?? "",
      encodedKey: env.encodedKey ?? "",
    });
  } finally {
    setOrDeleteEnv(ENCRYPTION_KEY_ID_ENV, originalKid);
    setOrDeleteEnv(ENCRYPTION_KEY_ENV, originalEncodedKey);
  }
};

const setOrDeleteEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    Deno.env.delete(name);
  } else {
    Deno.env.set(name, value);
  }
};

const generateBase64Key = (): string => {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key.toBase64();
};
