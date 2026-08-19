export class AppError extends Error {
  status: 400 | 401 | 409 | 410 | 422;
  code: string;
  constructor(
    message: string,
    status: 400 | 401 | 409 | 410 | 422,
    code: string,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
