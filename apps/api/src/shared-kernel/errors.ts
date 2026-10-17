/**
 * shared-kernel/errors.ts — AppError hierarchy.
 * All service errors extend AppError; routes never throw plain Error.
 * DOC3 §3.1 error model.
 */

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    // Maintains proper stack trace (V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** 422 — request body fails business validation (not a schema issue; use zod for that). */
export class ValidationError extends AppError {
  readonly code: string;
  readonly httpStatus = 422;

  constructor(message: string, details?: unknown, code = 'VALIDATION_ERROR') {
    super(message, details);
    this.code = code;
  }
}

/** 401 — unauthenticated. Never reveal whether email exists. */
export class AuthError extends AppError {
  readonly code = 'AUTH_ERROR';
  readonly httpStatus = 401;
}

/** 403 — authenticated but not authorised for this resource. */
export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}

/** 404 — resource does not exist. */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

/** 409 — state conflict (e.g. already checked in). */
export class ConflictError extends AppError {
  readonly code: string;
  readonly httpStatus = 409;

  constructor(message: string, details?: unknown, code = 'CONFLICT') {
    super(message, details);
    this.code = code;
  }
}

/** 429 — rate limit or attempt-count exceeded. */
export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMIT';
  readonly httpStatus = 429;
}

/** 503 — a downstream dependency (Redis, Mongo, Mailer) is unavailable. */
export class DependencyUnavailableError extends AppError {
  readonly code = 'DEPENDENCY_UNAVAILABLE';
  readonly httpStatus = 503;
}
