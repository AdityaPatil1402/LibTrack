import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// A real hash of a throwaway value. When a user does not exist we still run one comparison
// against it, so response time does not reveal which usernames exist.
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('libtrack-timing-equaliser', env.bcryptCost));

export const hashPassword = (plain) => bcrypt.hash(plain, env.bcryptCost);

/**
 * True only when `plain` matches `hash`.
 * A missing hash (unknown user) or malformed hash (a disabled seed account) is always false.
 */
export async function verifyPassword(plain, hash) {
  try {
    if (!hash) {
      await bcrypt.compare(plain, getDummyHash());
      return false;
    }
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
