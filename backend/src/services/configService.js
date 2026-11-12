import { query } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

/** Reads the business-rule settings stored in system_config (limits, rates, timezone). */
export async function getCirculationConfig() {
  const { rows } = await query(
    `SELECT key, value FROM system_config
      WHERE key IN ('max_active_issues', 'fine_per_day_inr', 'loan_period_days', 'library_timezone')`
  );
  const config = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const timezone = config.library_timezone;
  if (typeof timezone !== 'string' || timezone === '') {
    throw new HttpError(503, 'The library timezone is not configured yet. Run "npm run migrate" and try again.', {
      code: 'TIMEZONE_NOT_CONFIGURED',
    });
  }
  return {
    maxActiveIssues: Number(config.max_active_issues ?? 5),
    finePerDayInr: Number(config.fine_per_day_inr ?? 2),
    loanPeriodDays: Number(config.loan_period_days ?? 14),
    timezone,
  };
}
