import { describe, expect, it } from "vitest";
import { getFriendlyAuthErrorMessage } from "./auth-errors";

describe("friendly auth error mapping", () => {
  it("maps api-key-not-valid to friendly firebase setup message", () => {
    const error = {
      code: "auth/api-key-not-valid",
      message: "Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.).",
    };
    const message = getFriendlyAuthErrorMessage(error);
    expect(message).toContain("Firebase is not setup yet");
    expect(message).toContain(".env");
  });

  it("maps invalid-api-key to friendly firebase setup message", () => {
    const error = { code: "auth/invalid-api-key" };
    expect(getFriendlyAuthErrorMessage(error)).toContain("Firebase is not setup yet");
  });

  it("maps operation-not-allowed to firebase console instructions", () => {
    const error = { code: "auth/operation-not-allowed" };
    const msg = getFriendlyAuthErrorMessage(error);
    expect(msg).toContain("Email/Password authentication is not enabled");
    expect(msg).toContain("Firebase Console");
  });

  it("maps invalid credentials and wrong password", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/wrong-password" })).toContain("Incorrect college email or password");
    expect(getFriendlyAuthErrorMessage({ code: "auth/invalid-credential" })).toContain("Incorrect college email or password");
    expect(getFriendlyAuthErrorMessage({ code: "auth/user-not-found" })).toContain("Incorrect college email or password");
  });

  it("maps email-already-in-use", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/email-already-in-use" })).toContain("already exists");
  });

  it("maps weak password", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/weak-password" })).toContain("Password is too weak");
  });

  it("maps network errors", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/network-request-failed" })).toContain("Network connection error");
  });

  it("preserves college domain restriction message", () => {
    const custom = new Error("Registration is restricted to college students (@spit.ac.in).");
    expect(getFriendlyAuthErrorMessage(custom)).toBe("Registration is restricted to college students (@spit.ac.in).");
  });

  it("maps Google popup cancelled and blocked errors", () => {
    expect(getFriendlyAuthErrorMessage({ code: "auth/popup-closed-by-user" })).toContain("cancelled");
    expect(getFriendlyAuthErrorMessage({ code: "auth/popup-blocked" })).toContain("blocked by your browser");
    expect(getFriendlyAuthErrorMessage({ code: "auth/account-exists-with-different-credential" })).toContain("different sign-in method");
  });
});
