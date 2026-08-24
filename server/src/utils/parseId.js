const HttpError = require('./httpError');

// Postgres SERIAL/INTEGER columns are int4 (max 2147483647). Without this
// upper bound, a value like 99999999999999999999 passes Number.isInteger
// (JS floats represent it as a whole number) and reaches the database,
// which then throws a raw "22003 numeric_value_out_of_range" error - a
// leak of an internal error code/message that should have been a clean
// 400 at the validation layer.
const POSTGRES_INTEGER_MAX = 2147483647;

function parseId(raw, label = 'id') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0 || id > POSTGRES_INTEGER_MAX) {
    throw new HttpError(400, `Invalid ${label}.`, { code: 'VALIDATION_ERROR' });
  }
  return id;
}

module.exports = parseId;
module.exports.POSTGRES_INTEGER_MAX = POSTGRES_INTEGER_MAX;
