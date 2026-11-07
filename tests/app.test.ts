import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';

// Replace the real database pool with a fake one: these tests don't need it.
vi.mock('../src/db/pool.ts', () => ({ pool: { query: vi.fn() } }));

describe('app basics', () => {
  it('GET /health returns 200 and status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 404 for an unknown route', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('returns 400 for invalid JSON (via the error handler)', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
