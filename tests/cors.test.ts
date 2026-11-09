import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';

// These tests don't need the database.
vi.mock('../src/db/pool.ts', () => ({ pool: { query: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CORS', () => {
  it('allows any localhost port', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows the deployed front-end without any setting', async () => {
    const res = await request(app)
      .options('/api/entries')
      .set('Origin', 'https://sleep-tracker-ruddy.vercel.app')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe('https://sleep-tracker-ruddy.vercel.app');
  });

  it('allows an origin listed in CORS_ORIGINS', async () => {
    vi.stubEnv('CORS_ORIGINS', 'https://one.example, https://two.example/');

    const res = await request(app).get('/health').set('Origin', 'https://two.example');

    expect(res.headers['access-control-allow-origin']).toBe('https://two.example');
  });

  it('sends no CORS header to an origin that is not allowed', async () => {
    vi.stubEnv('CORS_ORIGINS', 'https://one.example');

    const res = await request(app).get('/health').set('Origin', 'https://evil.example');

    expect(res.status).toBe(200); // the server still answers; the browser blocks it
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the preflight OPTIONS request with 204', async () => {
    const res = await request(app)
      .options('/api/entries')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });
});
