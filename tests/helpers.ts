import { vi } from 'vitest';
import { signToken } from '../src/auth/tokens.ts';

// A made-up secret, only for tests. The real one lives in .env.
export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// Call in beforeEach. vi.stubEnv sets process.env.JWT_SECRET for this test
// only; vi.unstubAllEnvs() (or Vitest's reset between files) undoes it.
export function useTestSecret() {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
}

// The header a logged-in user would send, for supertest's .set():
//   request(app).get('/api/entries').set(authHeader('kaori'))
export function authHeader(username: string) {
  return { Authorization: `Bearer ${signToken(username)}` };
}
