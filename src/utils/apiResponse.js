/**
 * Every successful response has the shape:
 *   { success: true, message: string, data: object|null }
 */
const sendSuccess = (res, { status = 200, message = 'OK', data = null } = {}) =>
  res.status(status).json({ success: true, message, data });

module.exports = { sendSuccess };
