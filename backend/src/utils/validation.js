import { z } from 'zod';
import { HttpError } from './httpError.js';

// Usernames that members may not register (the seed borrower accounts use "seed_").
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'system', 'libtrack', 'support', 'librarian']);

const passwordField = (label = 'Password') =>
  z
    .string({ error: `${label} is required.` })
    .min(8, `${label} must be at least 8 characters.`)
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, `${label} must be at most 72 bytes long.`)
    .refine((v) => /[A-Za-z]/.test(v), `${label} must contain at least one letter.`)
    .refine((v) => /\d/.test(v), `${label} must contain at least one number.`);

export const normalizePhone = (value) => value.replace(/[\s\-().]/g, '');

const fullNameField = z
  .string({ error: 'Full name is required.' })
  .trim()
  .min(2, 'Full name must be at least 2 characters.')
  .max(100, 'Full name must be at most 100 characters.');

const usernameField = z
  .string({ error: 'Username is required.' })
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(30, 'Username must be at most 30 characters.')
  .regex(/^[A-Za-z0-9_.]+$/, 'Username may contain only letters, numbers, underscores and dots.')
  .refine(
    (v) => !RESERVED_USERNAMES.has(v.toLowerCase()) && !v.toLowerCase().startsWith('seed_'),
    'This username is not available.'
  );

const emailField = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

const phoneField = z
  .string({ error: 'Phone number is required.' })
  .trim()
  .transform(normalizePhone)
  .refine((v) => /^\+?[0-9]{10,15}$/.test(v), 'Enter a valid phone number (10 to 15 digits, optional leading +).');

export const signupSchema = z
  .object({
    fullName: fullNameField,
    username: usernameField,
    email: emailField,
    phone: phoneField,
    password: passwordField('Password'),
    confirmPassword: z.string({ error: 'Please confirm your password.' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const loginSchema = z.object({
  identifier: z.string({ error: 'Enter your username or email.' }).trim().min(1, 'Enter your username or email.').max(254),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(1024),
});

export const profileUpdateSchema = z
  .object({
    fullName: fullNameField.optional(),
    email: emailField.optional(),
    phone: phoneField.optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update.' });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string({ error: 'Enter your current password.' }).min(1, 'Enter your current password.').max(1024),
    newPassword: passwordField('New password'),
    confirmNewPassword: z.string({ error: 'Please confirm your new password.' }),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'Passwords do not match.',
  });

/** Parses `data` with `schema`; throws a 400 HttpError carrying per-field messages. */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;

  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  throw new HttpError(400, first, { code: 'VALIDATION_ERROR', fieldErrors });
}
