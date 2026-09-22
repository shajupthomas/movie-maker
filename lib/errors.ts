export class StudioError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StudioError";
    this.status = status;
  }
}
