// An error that is safe to show to the client. Anything else becomes a generic 500.
export class HttpError extends Error {
  constructor(status, message, { code, fieldErrors } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
