const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/health', () => {
  test('reports ok status and a connected database', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.timestamp).toBeTruthy();
  });
});

describe('GET /', () => {
  test('returns API identification', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('CCMS API');
  });
});

describe('unmatched API route', () => {
  test('returns a clean 404 JSON error, not a stack trace', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBeTruthy();
  });
});

describe('malformed request body', () => {
  test('returns a clean 400 JSON error, not the raw body-parser message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": not valid json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(res.body.error.message).not.toMatch(/Unexpected token/i);
  });
});
