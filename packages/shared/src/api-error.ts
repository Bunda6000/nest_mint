/** Error codes the API can return. The web app maps these to user-facing messages. */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  EmailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  NotFound: 'NOT_FOUND',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Every API error response has this shape. `details` holds field errors for validation failures. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Record<string, string>;
  };
}
