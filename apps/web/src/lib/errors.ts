/**
 * lib/errors.ts — translates server API errors into friendly, actionable UI messages.
 * DOC3 §3.1, DOC3 §3.3.
 */

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: Array<{ field: string; issue: string }> | undefined;
  requestId?: string;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: Array<{ field: string; issue: string }> | undefined;

  constructor(status: number, payload?: ApiErrorPayload) {
    super(payload?.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.httpStatus = status;
    this.code = payload?.code || 'UNKNOWN_ERROR';
    this.details = payload?.details;
  }
}

export function formatErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'OTP_INVALID':
        return 'The code you entered is invalid or has expired. Please try again.';
      case 'OTP_LOCKED':
        return 'Too many incorrect attempts. Please wait 10 minutes before requesting a new code.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a few moments and try again.';
      case 'INVALID_CREDENTIALS':
        return 'Invalid staff ID or PIN. Please check your credentials.';
      case 'MEAL_TOKEN_INVALID':
        return 'This meal QR code has expired or is invalid. Please scan the current code.';
      case 'ALREADY_CHECKED_IN':
        return 'You already have an active check-in for this meal.';
      case 'GEOFENCE_OUTSIDE':
        return 'You appear to be outside the mess hall geofence.';
      case 'VALIDATION_ERROR':
        if (err.details && err.details.length > 0) {
          return err.details.map((d) => d.issue).join('. ');
        }
        return err.message;
      default:
        return err.message || 'Something went wrong. Please try again.';
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
