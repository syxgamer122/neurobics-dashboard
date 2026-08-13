export class AppError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 409 | 410 | 422,
    readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
