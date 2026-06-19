import { createMiddleware } from "hono/factory";

const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;.*)?$/i;

export const requireJsonContentType = createMiddleware(async (c, next) => {
  const contentType = c.req.header("Content-Type");

  if (
    contentType === undefined ||
    !JSON_CONTENT_TYPE_PATTERN.test(contentType)
  ) {
    return c.json({
      error: "Validation failed",
      details: [{
        code: "custom",
        path: [],
        message: "Content-Type must be application/json",
      }],
    }, 400);
  }

  await next();
});
