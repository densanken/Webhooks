import { timingSafeEqual } from "@std/crypto/timing-safe-equal";
import type { OAuthVariables } from "@hono/oauth-providers";
import { discordAuth, type DiscordUser } from "@hono/oauth-providers/discord";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";

import {
  createSessionValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../../middleware/doc.ts";

const STATE_COOKIE = "doc_oauth_state";
const PROVIDER_STATE_COOKIE = "state";
const REDIRECT_COOKIE = "doc_oauth_redirect";
const STATE_MAX_AGE_SECONDS = 60 * 5;
const LOGIN_PATH = "/api/doc/login";
const LOGOUT_PATH = "/api/doc/logout";
const NOT_ALLOWED_LOGOUT_PATH = `${LOGOUT_PATH}?reason=not_allowed`;
const CALLBACK_PATH = "/api/doc/auth/oauth2/callback/discord";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_GUILDS_URL = "https://discord.com/api/v10/users/@me/guilds";

type DocOAuthEnv = {
  Variables: OAuthVariables & {
    "user-discord": Partial<DiscordUser> | undefined;
  };
};

export type DocOAuthConfig = {
  clientId: string;
  clientSecret: string;
  allowedGuildIds: readonly string[];
  sessionSecret: string;
  publicBaseUrl?: string;
  fetchFn?: typeof globalThis.fetch;
};

const DISCORD_CLIENT_ID_ENV = "DISCORD_CLIENT_ID";
const DISCORD_CLIENT_SECRET_ENV = "DISCORD_CLIENT_SECRET";
const DISCORD_ALLOWED_GUILD_IDS_ENV = "DISCORD_ALLOWED_GUILD_IDS";
const DOC_SESSION_SECRET_ENV = "DOC_SESSION_SECRET";

export const getDocOAuthConfig = (): DocOAuthConfig | null => {
  const clientId = Deno.env.get(DISCORD_CLIENT_ID_ENV);
  const clientSecret = Deno.env.get(DISCORD_CLIENT_SECRET_ENV);
  const allowedGuildIdsRaw = Deno.env.get(DISCORD_ALLOWED_GUILD_IDS_ENV);
  const sessionSecret = Deno.env.get(DOC_SESSION_SECRET_ENV);

  if (!clientId || !clientSecret || !allowedGuildIdsRaw || !sessionSecret) {
    return null;
  }

  const allowedGuildIds = parseAllowedGuildIds(allowedGuildIdsRaw);
  if (allowedGuildIds.length === 0) return null;

  return {
    clientId,
    clientSecret,
    allowedGuildIds,
    sessionSecret,
    publicBaseUrl: Deno.env.get("PUBLIC_BASE_URL"),
  };
};

export const parseAllowedGuildIds = (value: string): string[] =>
  value
    .split(",")
    .map((guildId) => guildId.trim())
    .filter(Boolean);

const randomState = (): string => {
  const state = new Uint8Array(32);
  crypto.getRandomValues(state);
  return state.toHex();
};

const textEncoder = new TextEncoder();

const timingSafeEquals = (a: string, b: string): boolean => {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
};

const isHttpsRequest = (requestUrl: string): boolean =>
  new URL(requestUrl).protocol === "https:";

const getUrl = (
  publicBaseUrl: string | undefined,
  requestUrl: string,
  path: string,
): string => {
  const origin = publicBaseUrl ?? new URL(requestUrl).origin;
  return `${origin}${path}`;
};

const getCallbackUrl = (
  publicBaseUrl: string | undefined,
  requestUrl: string,
): string => getUrl(publicBaseUrl, requestUrl, CALLBACK_PATH);

const normalizeRedirect = (redirect: string | undefined): string | null => {
  if (!redirect?.startsWith("/api/doc")) return null;
  if (
    redirect.startsWith("/api/doc/login") ||
    redirect.startsWith("/api/doc/logout") ||
    redirect.startsWith("/api/doc/auth/")
  ) {
    return null;
  }

  return redirect;
};

const errorWithLogoutUrl = (message: string) => ({
  error: `${message}. Logout: ${LOGOUT_PATH}`,
  logoutUrl: LOGOUT_PATH,
});

const readJsonResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const hasAllowedGuild = (
  guilds: unknown,
  allowedGuildIds: readonly string[],
): boolean | null => {
  if (!Array.isArray(guilds)) return null;

  return guilds.some((guild) =>
    typeof guild === "object" &&
    guild !== null &&
    "id" in guild &&
    typeof guild.id === "string" &&
    allowedGuildIds.includes(guild.id)
  );
};

export const createDocOAuthRoute = (config: DocOAuthConfig) => {
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const route = new Hono<DocOAuthEnv>({ strict: false });

  route.get("/login", (c) => {
    const state = randomState();
    const secure = isHttpsRequest(c.req.url);
    const cookieOptions = {
      httpOnly: true,
      secure,
      sameSite: "Lax" as const,
      maxAge: STATE_MAX_AGE_SECONDS,
      path: "/api/doc",
    };

    setCookie(c, STATE_COOKIE, state, cookieOptions);
    setCookie(c, PROVIDER_STATE_COOKIE, state, cookieOptions);
    const redirect = normalizeRedirect(c.req.query("redirect"));
    if (redirect) {
      setCookie(c, REDIRECT_COOKIE, redirect, cookieOptions);
    } else {
      deleteCookie(c, REDIRECT_COOKIE, { path: "/api/doc" });
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: getCallbackUrl(config.publicBaseUrl, c.req.url),
      response_type: "code",
      scope: "identify guilds",
      state,
    });

    return c.redirect(`${DISCORD_AUTHORIZE_URL}?${params}`, 302);
  });

  route.get(
    "/auth/oauth2/callback/discord",
    async (c, next) => {
      const error = c.req.query("error");
      if (error) {
        return c.json(errorWithLogoutUrl("OAuth denied"), 400);
      }

      const code = c.req.query("code");
      const state = c.req.query("state");
      const storedState = getCookie(c, STATE_COOKIE);
      const providerState = getCookie(c, PROVIDER_STATE_COOKIE);

      if (
        !code ||
        !state ||
        !storedState ||
        !providerState ||
        !timingSafeEquals(state, storedState) ||
        !timingSafeEquals(state, providerState)
      ) {
        deleteCookie(c, STATE_COOKIE, { path: "/api/doc" });
        deleteCookie(c, PROVIDER_STATE_COOKIE, { path: "/api/doc" });
        deleteCookie(c, REDIRECT_COOKIE, { path: "/api/doc" });
        return c.json(errorWithLogoutUrl("Invalid OAuth state"), 400);
      }

      await next();
    },
    discordAuth({
      scope: ["identify", "guilds"],
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.publicBaseUrl
        ? `${config.publicBaseUrl}${CALLBACK_PATH}`
        : undefined,
    }),
    async (c) => {
      const redirect = normalizeRedirect(getCookie(c, REDIRECT_COOKIE)) ??
        "/api/doc/ui";
      deleteCookie(c, STATE_COOKIE, { path: "/api/doc" });
      deleteCookie(c, PROVIDER_STATE_COOKIE, { path: "/api/doc" });
      deleteCookie(c, REDIRECT_COOKIE, { path: "/api/doc" });

      const user = c.get("user-discord");
      const token = c.get("token");

      if (!user?.id || !token?.token) {
        return c.json(errorWithLogoutUrl("Authentication failed"), 502);
      }

      let guildsResponse: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          guildsResponse = await fetchFn(DISCORD_GUILDS_URL, {
            headers: { Authorization: `Bearer ${token.token}` },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      } catch {
        return c.json(errorWithLogoutUrl("Failed to fetch guilds"), 502);
      }

      if (!guildsResponse.ok) {
        return c.json(errorWithLogoutUrl("Failed to fetch guilds"), 502);
      }

      const guilds = await readJsonResponse(guildsResponse);
      const allowed = hasAllowedGuild(guilds, config.allowedGuildIds);
      if (allowed === null) {
        return c.json(errorWithLogoutUrl("Invalid guilds response"), 502);
      }

      if (!allowed) {
        return c.redirect(NOT_ALLOWED_LOGOUT_PATH, 302);
      }

      const sessionValue = await createSessionValue(
        user.id,
        config.sessionSecret,
      );
      const secure = isHttpsRequest(c.req.url);

      setCookie(c, SESSION_COOKIE, sessionValue, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: "/api/doc",
      });

      return c.redirect(redirect, 302);
    },
  );

  route.get("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/api/doc" });
    deleteCookie(c, STATE_COOKIE, { path: "/api/doc" });
    deleteCookie(c, PROVIDER_STATE_COOKIE, { path: "/api/doc" });
    deleteCookie(c, REDIRECT_COOKIE, { path: "/api/doc" });

    const reason = c.req.query("reason");
    return c.json({
      message: reason === "not_allowed"
        ? "You have been logged out because your Discord account is not a member of an allowed server."
        : "Logged out successfully.",
      loginUrl: LOGIN_PATH,
    });
  });

  return route;
};
