import { describe, it, expect } from "vitest";
import {
  ApiError,
  AuthRequiredError,
  ValidationError,
  NetworkError,
  DegradedModeError,
  CrisisDetectedError,
} from "./errors";
import { MANDATORY_HELPLINES } from "../../../domain/risk/riskRouting";

describe("API Error Hierarchy and Safety Contract", () => {
  it("ApiError constructs with defaults and custom fields", () => {
    const defaultErr = new ApiError("something broke");
    expect(defaultErr).toBeInstanceOf(Error);
    expect(defaultErr).toBeInstanceOf(ApiError);
    expect(defaultErr.message).toBe("something broke");
    expect(defaultErr.statusCode).toBe(500);
    expect(defaultErr.code).toBe("INTERNAL_ERROR");
    expect(defaultErr.details).toBeUndefined();

    const customErr = new ApiError("custom fail", 400, "BAD_INPUT", { field: "email" });
    expect(customErr.statusCode).toBe(400);
    expect(customErr.code).toBe("BAD_INPUT");
    expect(customErr.details).toEqual({ field: "email" });
  });

  it("AuthRequiredError sets 401 status and AUTH_REQUIRED code", () => {
    const err = new AuthRequiredError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.message).toContain("Authentication required");

    const customMsg = new AuthRequiredError("Session expired");
    expect(customMsg.message).toBe("Session expired");
  });

  it("ValidationError sets 422 status and VALIDATION_ERROR code with details", () => {
    const err = new ValidationError("Invalid inputs", { field: "passphrase" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "passphrase" });
  });

  it("NetworkError sets 503 status and NETWORK_ERROR code", () => {
    const err = new NetworkError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toContain("Network connection failed");
  });

  it("DegradedModeError sets 503 status and DEGRADED_MODE code", () => {
    const err = new DegradedModeError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("DEGRADED_MODE");
    expect(err.message).toContain("Operating in degraded mode");
  });

  it("CrisisDetectedError carries mandatory helplines and 400 status", () => {
    const err = new CrisisDetectedError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("CRISIS_DETECTED");
    expect(err.helplines).toEqual(MANDATORY_HELPLINES);
    expect(err.details).toEqual({ helplines: MANDATORY_HELPLINES });

    // Custom helpline list
    const customList = [{ id: "test", name: "Test", number: "123", description: "d", availability: "24/7", languages: "all" }];
    const customErr = new CrisisDetectedError("Custom crisis", customList);
    expect(customErr.helplines).toEqual(customList);
  });
});
