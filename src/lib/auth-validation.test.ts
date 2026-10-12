import { describe, expect, it } from "vitest";
import { isCollegeEmail, validateSignupEmail } from "./auth-validation";

describe("auth validation", () => {
  it("accepts valid @spit.ac.in emails", () => {
    expect(isCollegeEmail("student@spit.ac.in")).toBe(true);
    expect(isCollegeEmail("john.doe@spit.ac.in")).toBe(true);
    expect(isCollegeEmail("student@SPIT.AC.IN")).toBe(true);
    expect(validateSignupEmail("student@spit.ac.in")).toEqual({ valid: true });
  });

  it("rejects non-spit emails", () => {
    expect(isCollegeEmail("user@gmail.com")).toBe(false);
    expect(isCollegeEmail("user@spit.ac.in.fake")).toBe(false);
    expect(isCollegeEmail("user@othercollege.edu")).toBe(false);
    expect(isCollegeEmail("spit.ac.in@gmail.com")).toBe(false);
    expect(isCollegeEmail("")).toBe(false);

    expect(validateSignupEmail("user@gmail.com").valid).toBe(false);
    expect(validateSignupEmail("user@gmail.com").error).toContain("@spit.ac.in");
  });

  it("handles missing email", () => {
    expect(validateSignupEmail("").valid).toBe(false);
    expect(validateSignupEmail("   ").valid).toBe(false);
  });
});
