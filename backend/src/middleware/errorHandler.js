import { HttpError } from '../utils/httpError.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, fieldErrors: err.fieldErrors });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'BAD_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request body is too large.', code: 'TOO_LARGE' });
  }

  // Anything unexpected: log details on the server, reveal nothing to the client.
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
}
