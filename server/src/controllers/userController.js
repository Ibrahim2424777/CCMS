const userService = require('../services/userService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const parseId = require('../utils/parseId');

const VALID_ROLES = ['ADMIN', 'STAFF'];

const list = asyncHandler(async (req, res) => {
  const users = await userService.listUsers();
  res.json({ data: users });
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !String(name).trim()) {
    throw new HttpError(400, 'Name is required.', { code: 'VALIDATION_ERROR' });
  }
  if (!email || !String(email).trim()) {
    throw new HttpError(400, 'Email is required.', { code: 'VALIDATION_ERROR' });
  }
  if (!password || String(password).length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters.', { code: 'VALIDATION_ERROR' });
  }
  if (!VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Role must be ADMIN or STAFF.', { code: 'VALIDATION_ERROR' });
  }

  try {
    const user = await userService.createUser({
      name: String(name).trim(),
      email: String(email).trim(),
      password: String(password),
      role,
    });
    res.status(201).json({ data: user });
  } catch (err) {
    // Let the DB's case-insensitive unique constraint be the single source of
    // truth for "does this email already exist" (avoids a racy pre-check).
    if (err.code === '23505') {
      throw new HttpError(409, 'A user with this email already exists.', { code: 'DUPLICATE_EMAIL' });
    }
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'user id');

  const { name, role, is_active } = req.body || {};

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Role must be ADMIN or STAFF.', { code: 'VALIDATION_ERROR' });
  }
  if (is_active === false && req.user.id === id) {
    throw new HttpError(400, 'You cannot deactivate your own account.', { code: 'SELF_DEACTIVATION' });
  }

  const updated = await userService.updateUser(id, {
    name: name !== undefined ? String(name).trim() : undefined,
    role,
    is_active,
  });

  if (!updated) {
    throw new HttpError(404, 'User not found.', { code: 'NOT_FOUND' });
  }
  res.json({ data: updated });
});

module.exports = { list, create, update };
