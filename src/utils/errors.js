// src/utils/errors.js

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, 401);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404);
  }
}

// [BARU] 409 — permintaan bentrok dengan state data yang ada
// (misal: jual lot melebihi yang dimiliki)
class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message) {
    super(message, 429);
  }
}

class ExternalServiceError extends AppError {
  constructor(message) {
    super(message, 502);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  ExternalServiceError
};