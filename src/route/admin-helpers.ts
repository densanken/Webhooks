import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { UseCaseError } from "../usecase/error/impl.ts";

export const jsonContent = <T>(schema: T) => ({
  "application/json": { schema },
});

export const noStoreHeader = {
  "Cache-Control": {
    description: "秘密情報を含むレスポンスがキャッシュされないようにします",
    schema: {
      type: "string" as const,
      example: "no-store",
    },
  },
};

export const handleAdminError = (error: Error, c: Context): Response => {
  if (
    error instanceof HTTPException &&
    error.status === 400 &&
    error.message === "Malformed JSON in request body"
  ) {
    return c.json({
      error: "Validation failed",
      details: [{
        code: "custom",
        path: [],
        message: error.message,
      }],
    }, 400);
  }

  if (!(error instanceof UseCaseError)) throw error;

  return c.json({
    error: error.message,
    code: error.code,
  }, error.status);
};
