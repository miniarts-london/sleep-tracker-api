import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.ts';
import { pool } from '../src/db/pool.ts';
import { TEST_SECRET, authHeader, useTestSecret } from './helpers.ts';

// Tests the requireAuth middleware through a real protected route.
vi.mock('../src/db/pool.ts', () => ({ pool: { query: vi.fn() } }));
const query = pool.query as unknown as Mock;

const URL = '/api/users/kaori/entries';

beforeEach(() => {
  query.mockReset();
  useTestSecret();
});

describe('requireAuth', () => {
  it('lets a valid token through', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(URL).set(authHeader('kaori'));

    expect(res.status).toBe(200);
  });

  it.each([
    ['no Authorization header', undefined],
    ['the wrong scheme', 'Basic a2Fvcmk6cGFzc3dvcmQ='],
    ['"Bearer" with no token', 'Bearer'],
    ['a token that is not a JWT', 'Bearer not-a-real-token'],
    [
      'a token signed with a different secret',
      `Bearer ${jwt.sign({}, 'some-other-secret-that-is-32-characters', { subject: 'kaori' })}`,
    ],
    [
      'an expired token',
      // expiresIn: -10 means "expired 10 seconds ago".
      `Bearer ${jwt.sign({}, TEST_SECRET, { subject: 'kaori', expiresIn: -10 })}`,
    ],
    [
      'an unsigned token (alg: none)',
      `Bearer ${jwt.sign({}, '', { subject: 'kaori', algorithm: 'none' })}`,
    ],
    ['a token with no user in it', `Bearer ${jwt.sign({}, TEST_SECRET)}`],
  ])('returns 401 for %s', async (_label, header) => {
    const req = request(app).get(URL);
    const res = await (header ? req.set('Authorization', header) : req);

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body).toHaveProperty('error');
    expect(query).not.toHaveBeenCalled(); // the handler never ran
  });

  it('returns 500, not 401, when JWT_SECRET is missing on the server', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const header = authHeader('kaori'); // made while the secret is set
    vi.stubEnv('JWT_SECRET', '');

    const res = await request(app).get(URL).set(header);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });

  it('still returns 404 for unknown /api URLs (auth is per route)', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
  });
});
