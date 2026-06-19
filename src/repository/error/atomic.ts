import { WebhookRepositoryConflictError } from "./impl.ts";

export const assertAtomicCommit = (
  result: Deno.KvCommitResult | Deno.KvCommitError,
  message: string,
): void => {
  if (!result.ok) {
    throw new WebhookRepositoryConflictError(message);
  }
};
