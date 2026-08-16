export class AppError extends Error {
  constructor(
    message: string,
    status: 400 | 401 | 409 | 410 | 422,
    code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
