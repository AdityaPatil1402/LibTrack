import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDashboardSummary } from '../services/dashboardService.js';

/** Dashboard numbers for the signed-in member only; the user id always comes from the session. */
export function createDashboardRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/summary', async (req, res) => {
    res.json(await getDashboardSummary(req.user.id));
  });

  return router;
}
