// A thrown HttpError carries everything app.js's centralized error handler
// needs (status/message/code) and marks the message safe to show to the
// client (expose: true) - anything NOT thrown as an HttpError is treated as
// an unexpected internal error and never has its raw message exposed
// (MASTER CONTEXT section 28).
class HttpError extends Error {
  constructor(status, message, { code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

module.exports = HttpError;
