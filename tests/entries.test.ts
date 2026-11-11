import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import app from '../src/app.ts';
import { pool } from '../src/db/pool.ts';

// Swap the real database pool for a fake. Each test tells the fake what
// the database "returns", then checks the HTTP response. vi.mock runs
// before the imports above, so the app only ever sees the fake.
vi.mock('../src/db/pool.ts', () => ({ pool: { query: vi.fn() } }));
const query = pool.query as unknown as Mock;

const validEntry = {
  user_id: 'kaori',
  first_name: 'Kaori',
  last_name: 'Nishimura',
  sleep_time: 7.5,
  date: '2026-11-06',
};

beforeEach(() => {
  query.mockReset();
});

describe('POST /api/entries', () => {
  it('creates an entry and returns 201 with success: true', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // duplicate check: none found
      .mockResolvedValueOnce({ rows: [] }); // the INSERT

    const res = await request(app).post('/api/entries').send(validEntry);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, details: null });
  });

  it('sends values as query parameters, never inside the SQL', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [validEntry] });

    await request(app).post('/api/entries').send(validEntry);

    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('$1');
    expect(sql).not.toContain('Kaori');
    expect(params).toEqual(['kaori', 'Kaori', 'Nishimura', 7.5, '2026-11-06']);
  });

  it('trims spaces around names', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [validEntry] });

    await request(app)
      .post('/api/entries')
      .send({ ...validEntry, first_name: '  Kaori ', last_name: ' Nishimura  ' });

    const [, params] = query.mock.calls[1];
    expect(params[1]).toBe('Kaori');
    expect(params[2]).toBe('Nishimura');
  });

  it('returns 400 listing every problem when fields are missing', async () => {
    const res = await request(app).post('/api/entries').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // One { fieldName, message } per field, in the order they're checked.
    expect(res.body.details.map((e: { fieldName: string }) => e.fieldName)).toEqual([
      'user_id',
      'first_name',
      'last_name',
      'sleep_time',
      'date',
    ]);
    expect(query).not.toHaveBeenCalled(); // never reached the database
  });

  it('gives each error a fieldName and a readable message', async () => {
    const res = await request(app).post('/api/entries').send({ ...validEntry, sleep_time: 30 });

    expect(res.body).toEqual({
      success: false,
      details: [
        {
          fieldName: 'sleep_time',
          message: 'sleep_time must be a number from 1 to 24, in steps of 0.5',
        },
      ],
    });
  });

  it.each([
    ['user_id is a number', { user_id: 1 }],
    ['user_id is empty', { user_id: '' }],
    ['user_id has a space', { user_id: 'kaori n' }],
    ['user_id has a slash', { user_id: 'a/b' }],
    ['user_id is too long', { user_id: 'x'.repeat(51) }],
    ['first_name is blank', { first_name: '   ' }],
    ['last_name is too long', { last_name: 'x'.repeat(51) }],
    ['sleep_time is below 1', { sleep_time: 0.5 }],
    ['sleep_time is above 24', { sleep_time: 24.5 }],
    ['sleep_time is not a half step', { sleep_time: 7.3 }],
    ['sleep_time is text', { sleep_time: '8' }],
    ['date is not a real date', { date: '2026-02-30' }],
    ['date is in the wrong format', { date: '06/11/2026' }],
  ])('returns 400 when %s', async (_label, change) => {
    const res = await request(app).post('/api/entries').send({ ...validEntry, ...change });

    expect(res.status).toBe(400);
    // Only the changed field is reported, under its own name.
    expect(res.body.success).toBe(false);
    expect(res.body.details).toHaveLength(1);
    expect(res.body.details[0].fieldName).toBe(Object.keys(change)[0]);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([1, 7.5, 24])('accepts sleep_time %s', async (sleep_time) => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ ...validEntry, sleep_time }] });

    const res = await request(app).post('/api/entries').send({ ...validEntry, sleep_time });

    expect(res.status).toBe(201);
  });

  it('returns 409 when this user already has an entry for that date', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // duplicate found

    const res = await request(app).post('/api/entries').send(validEntry);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      details: [{ fieldName: 'date', message: 'An entry for this user and date already exists' }],
    });
    expect(query).toHaveBeenCalledTimes(1); // the INSERT never ran
  });

  it('returns 409 if the database unique rule catches a duplicate', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    const res = await request(app).post('/api/entries').send(validEntry);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.details[0].fieldName).toBe('date');
  });

  it('returns 500 (via the error handler) when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); // keep test output quiet
    query.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(app).post('/api/entries').send(validEntry);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' }); // no internal details leaked
    spy.mockRestore();
  });
});

describe('GET /api/entries', () => {
  it('returns each user with their entry count as a number', async () => {
    // Shaped like the real query's rows: Postgres sends COUNT as text.
    query.mockResolvedValueOnce({
      rows: [
        { user_id: 'kaori', first_name: 'Kaori', last_name: 'Nishimura', count: '3' },
        { user_id: 'sam', first_name: 'Sam', last_name: 'Nishimura', count: '1' },
      ],
    });

    const res = await request(app).get('/api/entries');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { user_id: 'kaori', first_name: 'Kaori', last_name: 'Nishimura', count: 3 },
      { user_id: 'sam', first_name: 'Sam', last_name: 'Nishimura', count: 1 },
    ]);
  });

  it('returns 200 with an empty list when there are no entries', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/entries');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('sends a database failure to the central error handler as 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(app).get('/api/entries');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('GET /api/users/:userId/entries', () => {
  it("returns the user's entries", async () => {
    query.mockResolvedValueOnce({ rows: [validEntry] });

    const res = await request(app).get('/api/users/kaori/entries');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([validEntry]);
    expect(query.mock.calls[0][1]).toEqual(['kaori']);
  });

  it('accepts ids with numbers, - and _', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/users/user_42-b/entries');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(['user_42-b']);
  });

  it('turns a numeric sleep_time string from Postgres into a number', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...validEntry, sleep_time: '7.5' }] });

    const res = await request(app).get('/api/users/kaori/entries');

    expect(res.body[0].sleep_time).toBe(7.5);
  });

  it('returns 200 with an empty list when the user has no entries', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/users/nobody/entries');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // %20 is a space and %2F a slash, as a browser would encode them in a URL.
  it.each(['a%20b', 'a%2Fb', 'a.b', 'x'.repeat(51)])('returns 400 for userId %s', async (userId) => {
    const res = await request(app).get(`/api/users/${userId}/entries`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      details: [{ fieldName: 'userId', message: 'userId must be 1 to 50 letters, numbers, - or _' }],
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/:userId/entries/:date', () => {
  it('returns one entry', async () => {
    query.mockResolvedValueOnce({ rows: [validEntry] });

    const res = await request(app).get('/api/users/kaori/entries/2026-11-06');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(validEntry);
    expect(query.mock.calls[0][1]).toEqual(['kaori', '2026-11-06']);
  });

  it('returns 404 when there is no entry for that date', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/users/kaori/entries/2026-01-01');

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid date', async () => {
    const res = await request(app).get('/api/users/kaori/entries/2026-13-01');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      details: [{ fieldName: 'date', message: 'date must be a real date in YYYY-MM-DD format' }],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid userId', async () => {
    const res = await request(app).get('/api/users/a%20b/entries/2026-11-06');

    expect(res.status).toBe(400);
  });
});
