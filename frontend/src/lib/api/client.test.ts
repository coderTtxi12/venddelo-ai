import { describe, expect, it } from "vitest";
import { ApiError } from "./types";

describe("ApiError", () => {
  it("stores code and status", () => {
    const err = new ApiError("not_found", "Missing", 404);
    expect(err.code).toBe("not_found");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toBe("Missing");
  });
});
