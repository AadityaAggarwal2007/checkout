/** An error whose message is safe to show to the caller. Anything else becomes a plain 500. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    opts: { cause?: unknown; data?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: opts.cause });
    this.data = opts.data;
  }

  /** Extra fields sent with the error (e.g. the new checkout state when a price changed). */
  readonly data?: Record<string, unknown>;
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message);
export const unauthorized = (message = 'Please log in.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
