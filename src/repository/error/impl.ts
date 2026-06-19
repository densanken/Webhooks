export class WebhookRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookRepositoryConflictError";
  }
}

export class WebhookRepositoryCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookRepositoryCommitError";
  }
}
