class AppError extends Error {
  /**
   * @param {string} message  client-safe message
   * @param {number} statusCode HTTP status
   * @param {Array<{field:string,message:string}>} [errors] optional field errors
   */
  constructor(message, statusCode = 500, errors) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    if (errors) this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
