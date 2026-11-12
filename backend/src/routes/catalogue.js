import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { parseOrThrow } from '../utils/validation.js';
import { authenticate } from '../middleware/auth.js';
import { getBookDetails, getFilterOptions, getRecommendations, searchBooks } from '../services/catalogueService.js';

const id = z.coerce.number().int().positive();

const searchSchema = z.object({
  q: z.string().trim().max(100, 'Search text is too long.').optional(),
  authorId: id.optional(),
  genreId: id.optional(),
  sort: z.enum(['title', 'author', 'recent'], { error: 'Sort must be title, author or recent.' }).default('title'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

const bookIdSchema = z.object({ id: id });

/** Catalogue API. Read-only; everything here requires a signed-in member. */
export function createCatalogueRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/books', async (req, res) => {
    const params = parseOrThrow(searchSchema, req.query);
    res.json(await searchBooks({ ...params, q: params.q || undefined }));
  });

  router.get('/filters', async (_req, res) => {
    res.json(await getFilterOptions());
  });

  router.get('/recommendations', async (_req, res) => {
    res.json(await getRecommendations());
  });

  router.get('/books/:id', async (req, res) => {
    const { id: bookId } = parseOrThrow(bookIdSchema, req.params);
    const book = await getBookDetails(bookId);
    if (!book) throw new HttpError(404, 'That book could not be found.', { code: 'BOOK_NOT_FOUND' });
    res.json({ book });
  });

  return router;
}
