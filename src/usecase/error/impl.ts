import type { UseCaseErrorCode } from "./interface.ts";

export class UseCaseError extends Error {
  readonly code: UseCaseErrorCode;
  readonly status: 400 | 401 | 404 | 502;
  readonly upstreamStatus?: number;

  constructor(
    code: UseCaseErrorCode,
    message: string,
    status: 400 | 401 | 404 | 502,
    options: { upstreamStatus?: number } = {},
  ) {
    super(message);
    this.name = "UseCaseError";
    this.code = code;
    this.status = status;
    this.upstreamStatus = options.upstreamStatus;
  }
}
