import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { pool } from '../src/db/pool.ts';
import { verifyToken } from '../src/auth/tokens.ts';
import { useTestSecret } from './helpers.ts';

// Same fake database as the other tests.
vi.mock('../src/db/pool.ts', () => ({ pool: { query: vi.fn() } }));
const query = pool.query as unknown as Mock;

const newUser = {
  username: 'kaori',
  password: 'correct horse battery',
  first_name: 'Kaori',
  last_name: 'Nishimura',
};

beforeEach(() => {
  query.mockReset();
  useTestSecret();
});

describe('POST /api/auth/register', () => {
  it('creates the user and returns 201', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // the INSERT

    const res = await request(app).post('/api/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, details: null });
  });

  it('stores a bcrypt hash, never the password itself', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).post('/api/auth/register').send(newUser);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('$1'); // parameterised, values never inside the SQL
    const [username, passwordHash, firstName, lastName] = params;
    expect(username).toBe('kaori');
    expect(passwordHash).not.toBe(newUser.password);
    expect(passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12
    expect(await bcrypt.compare(newUser.password, passwordHash)).toBe(true);
    expect([firstName, lastName]).toEqual(['Kaori', 'Nishimura']);
  });

  it('returns 400 listing every problem when fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body.details.map((e: { fieldName: string }) => e.fieldName)).toEqual([
      'username',
      'password',
      'first_name',
      'last_name',
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['username has a space', { username: 'kaori n' }],
    ['username is too long', { username: 'x'.repeat(51) }],
    ['password is too short', { password: 'short' }],
    ['password is over 72 bytes', { password: 'x'.repeat(73) }],
    // 19 emoji = 19 x 4 bytes = 76 bytes, though it's only 38 JS characters.
    ['password is over 72 bytes in emoji', { password: '😴'.repeat(19) }],
    ['password is a number', { password: 12345678 }],
    ['first_name is blank', { first_name: ' ' }],
  ])('returns 400 when %s', async (_label, change) => {
    const res = await request(app).post('/api/auth/register').send({ ...newUser, ...change });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(1);
    expect(res.body.details[0].fieldName).toBe(Object.keys(change)[0]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 409 when the username is taken', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    const res = await request(app).post('/api/auth/register').send(newUser);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      details: [{ fieldName: 'username', message: 'Username is already taken' }],
    });
  });
});

describe('POST /api/auth/login', () => {
  // A low cost (4) keeps the tests fast; the app uses 12 for real hashes.
  const storedUser = {
    username: 'kaori',
    password_hash: bcrypt.hashSync(newUser.password, 4),
    first_name: 'Kaori',
    last_name: 'Nishimura',
  };

  it('returns a token for the right password', async () => {
    query.mockResolvedValueOnce({ rows: [storedUser] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kaori', password: newUser.password });

    expect(res.status).toBe(200);
    expect(res.body.expires_in).toBe(3600);
    expect(verifyToken(res.body.token)).toBe('kaori'); // a real, valid token
    expect(query.mock.calls[0][1]).toEqual(['kaori']);
  });

  it("returns the user's names but never the password hash", async () => {
    query.mockResolvedValueOnce({ rows: [storedUser] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kaori', password: newUser.password });

    expect(res.body.first_name).toBe('Kaori');
    expect(res.body.last_name).toBe('Nishimura');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 401 for a wrong password', async () => {
    query.mockResolvedValueOnce({ rows: [storedUser] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kaori', password: 'wrong password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid username or password' });
    expect(res.body.token).toBeUndefined();
  });

  it('returns the exact same 401 for an unknown user', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no such user

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid username or password' });
  });

  it('returns 400 when username or password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.details.map((e: { fieldName: string }) => e.fieldName)).toEqual([
      'username',
      'password',
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 500 (via the error handler) when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kaori', password: newUser.password });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
