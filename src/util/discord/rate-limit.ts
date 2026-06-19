export const isActiveRateLimit = (
  blockedUntilEpochMs: number,
  now: Date,
): boolean => blockedUntilEpochMs > now.getTime();

export const toSafeRetryAfterMs = (retryAfterMs: number): number => {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) return 0;
  return Math.trunc(retryAfterMs);
};

export const toBlockedUntilEpochMs = (
  completedAt: Date,
  retryAfterMs: number,
  absoluteBlockedUntilEpochMs?: number,
): number =>
  Math.max(
    completedAt.getTime() + retryAfterMs,
    absoluteBlockedUntilEpochMs ?? 0,
  );
