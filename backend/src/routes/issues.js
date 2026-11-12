import { Router } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../utils/validation.js';
import { authenticate } from '../middleware/auth.js';
import { getIssueEligibility, getMyBooks, issueBook } from '../services/issueService.js';

const bookId = z.coerce.number({ error: 'Choose a book to issue.' }).int().positive('Choose a book to issue.');
const issueSchema = z.object({ bookId });
const eligibilitySchema = z.object({ bookId });

/** Issuing and "My Books". The member is always taken from the session, never from the request. */
export function createIssuesRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/mine', async (req, res) => {
    res.json(await getMyBooks(req.user.id));
  });

  router.get('/eligibility', async (req, res) => {
    const params = parseOrThrow(eligibilitySchema, req.query);
    res.json(await getIssueEligibility(req.user.id, params.bookId));
  });

  router.post('/', async (req, res) => {
    const params = parseOrThrow(issueSchema, req.body);
    const result = await issueBook(req.user.id, params.bookId);
    res.status(201).json({ ...result, message: `"${result.issue.title}" has been issued to you.` });
  });

  return router;
}
