import { MANDATORY_HELPLINES, type HelplineInfo } from "../../../domain/risk/riskRouting";

export interface ApiErrorDetails {
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthRequiredError extends ApiError {
  constructor(message = "Authentication required. Student identity must originate from an active Supabase session.") {
    super(message, 401, "AUTH_REQUIRED");
    this.name = "AuthRequiredError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 422, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class NetworkError extends ApiError {
  constructor(message = "Network connection failed or service unreachable.", details?: ApiErrorDetails) {
    super(message, 503, "NETWORK_ERROR", details);
    this.name = "NetworkError";
  }
}

export class DegradedModeError extends ApiError {
  constructor(message = "Companion API is temporarily unreachable. Operating in degraded mode.", details?: ApiErrorDetails) {
    super(message, 503, "DEGRADED_MODE", details);
    this.name = "DegradedModeError";
  }
}

export class CrisisDetectedError extends ApiError {
  readonly helplines: readonly HelplineInfo[];

  constructor(
    message = "Immediate crisis detected. Please connect with confidential 24/7 helplines.",
    helplines: readonly HelplineInfo[] = MANDATORY_HELPLINES,
  ) {
    super(message, 400, "CRISIS_DETECTED", { helplines });
    this.name = "CrisisDetectedError";
    this.helplines = helplines;
  }
}

export function handleApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof Error) {
    return new ApiError(error.message, 500, "UNKNOWN_ERROR", { raw: error.name });
  }
  return new ApiError("An unexpected error occurred", 500, "UNKNOWN_ERROR", { raw: error });
}
