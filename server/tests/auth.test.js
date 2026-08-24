const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ADMIN_EMAIL = `auth-test-admin-${RUN_ID}@ccms.local`;
const STAFF_EMAIL = `auth-test-staff-${RUN_ID}@ccms.local`;
const INACTIVE_EMAIL = `auth-test-inactive-${RUN_ID}@ccms.local`;

let adminId;
let staffId;
let inactiveId;
const cleanupEmails = [];

async function createUser({ name, email, role, isActive = true }) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, email, hash, role, isActive]
  );
  return rows[0].id;
}

beforeAll(async () => {
  adminId = await createUser({ name: 'Auth Test Admin', email: ADMIN_EMAIL, role: 'ADMIN' });
  staffId = await createUser({ name: 'Auth Test Staff', email: STAFF_EMAIL, role: 'STAFF' });
  inactiveId = await createUser({
    name: 'Auth Test Inactive',
    email: INACTIVE_EMAIL,
    role: 'STAFF',
    isActive: false,
  });
});

afterAll(async () => {
  const ids = [adminId, staffId, inactiveId];
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  if (cleanupEmails.length > 0) {
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [cleanupEmails]);
  }
  await pool.end();
});

describe('POST /api/auth/login', () => {
  test('succeeds with correct credentials and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.email.toLowerCase()).toBe(STAFF_EMAIL.toLowerCase());
    expect(res.body.data.role).toBe('STAFF');
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('email is case-insensitive at login (CITEXT)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: STAFF_EMAIL.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
  });

  test('rejects an unknown email with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-such-user@ccms.local', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects a wrong password with the SAME generic message as an unknown email (no user enumeration)', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: STAFF_EMAIL, password: 'WrongPassword123!' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-such-user@ccms.local', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('rejects a deactivated account with a distinct message, even with the correct password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: INACTIVE_EMAIL, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  test('rejects a request missing email or password', async () => {
    const noPassword = await request(app).post('/api/auth/login').send({ email: STAFF_EMAIL });
    const noEmail = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(noPassword.status).toBe(400);
    expect(noEmail.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 for a garbage/tampered session cookie instead of crashing', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'ccms.sid=not-a-real-session-value');
    expect(res.status).toBe(401);
  });

  test('returns the current user when logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(staffId);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the session so /me becomes unauthenticated again', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);
    await agent.get('/api/auth/me').expect(200);

    await agent.post('/api/auth/logout').expect(204);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('is safe to call when not logged in', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

describe('a session becomes invalid immediately after the user is deactivated mid-session', () => {
  test('instant revocation (the reason sessions were chosen over JWT)', async () => {
    const email = `mid-session-${RUN_ID}@ccms.local`;
    const userId = await createUser({ name: 'Mid Session', email, role: 'STAFF' });
    cleanupEmails.push(email);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    await agent.get('/api/auth/me').expect(200);

    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('authorization: /api/users is ADMIN-only', () => {
  test('anonymous requests are rejected (401)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('STAFF is rejected (403), not just anonymous callers', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent.get('/api/users');
    expect(res.status).toBe(403);
  });

  test('ADMIN can list users', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((u) => u.id === staffId)).toBe(true);
    expect(res.body.data[0].password_hash).toBeUndefined();
  });

  test('STAFF cannot create a user', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent
      .post('/api/users')
      .send({ name: 'Nope', email: `nope-${RUN_ID}@ccms.local`, password: 'SomePassword1', role: 'STAFF' });
    expect(res.status).toBe(403);
  });
});

describe('admin user management foundation', () => {
  test('ADMIN can create a user, and the stored password is a real bcrypt hash (never plaintext)', async () => {
    const email = `created-by-admin-${RUN_ID}@ccms.local`;
    cleanupEmails.push(email);
    const plaintextPassword = 'BrandNewPassword1';

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent
      .post('/api/users')
      .send({ name: 'Created By Admin', email, password: plaintextPassword, role: 'STAFF' });

    expect(res.status).toBe(201);
    expect(res.body.data.password_hash).toBeUndefined();

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(rows[0].password_hash).not.toBe(plaintextPassword);
    expect(rows[0].password_hash.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare(plaintextPassword, rows[0].password_hash)).toBe(true);
  });

  test('rejects creating a user with a duplicate (case-insensitive) email', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent
      .post('/api/users')
      .send({ name: 'Dup', email: STAFF_EMAIL.toUpperCase(), password: 'SomePassword1', role: 'STAFF' });
    expect(res.status).toBe(409);
  });

  test('rejects a password shorter than 8 characters', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent
      .post('/api/users')
      .send({ name: 'Short Pw', email: `short-${RUN_ID}@ccms.local`, password: 'short', role: 'STAFF' });
    expect(res.status).toBe(400);
  });

  test('ADMIN can deactivate another user, and that user is immediately locked out', async () => {
    const email = `deactivate-me-${RUN_ID}@ccms.local`;
    const userId = await createUser({ name: 'Deactivate Me', email, role: 'STAFF' });
    cleanupEmails.push(email);

    const targetAgent = request.agent(app);
    await targetAgent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    await targetAgent.get('/api/auth/me').expect(200);

    const adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);
    const updateRes = await adminAgent.put(`/api/users/${userId}`).send({ is_active: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.is_active).toBe(false);

    const res = await targetAgent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('an admin cannot deactivate their own account', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent.put(`/api/users/${adminId}`).send({ is_active: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');
  });

  test('updating a non-existent user returns 404', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);

    const res = await agent.put('/api/users/9999999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

// Kept last so it doesn't disturb the login-attempt counts the tests above rely on.
describe('rate limiting on /api/auth/login', () => {
  test(
    'eventually responds 429 after repeated rapid attempts',
    async () => {
      let sawRateLimited = false;
      for (let i = 0; i < 25; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'burst-test@ccms.local', password: 'irrelevant' });
        if (res.status === 429) {
          sawRateLimited = true;
          break;
        }
      }
      expect(sawRateLimited).toBe(true);
    },
    // Each failed attempt runs a real bcrypt.compare() against the dummy hash
    // (deliberately slow, by design - see authService.js) so 25 of them can
    // exceed Jest's default 5s test timeout even though nothing is actually
    // broken. Without this, a timed-out-but-still-running loop can keep firing
    // requests after afterAll() has already closed the pool, surfacing as a
    // spurious "Cannot use a pool after calling end" failure instead of the
    // real, slower-than-usual completion.
    20000
  );
});
