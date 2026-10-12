/**
 * Maps Firebase Auth and backend errors to user-friendly messages.
 */
export function getFriendlyAuthErrorMessage(err: unknown): string {
  if (!err) return "An unexpected error occurred.";

  const errObj = err as { code?: string; message?: string };
  const code = (errObj.code || "").toLowerCase();
  const rawMsg = errObj.message || "";
  const msgLower = rawMsg.toLowerCase();

  // Firebase not setup, invalid API key, or missing project configuration
  if (
    code.includes("api-key-not-valid") ||
    code.includes("invalid-api-key") ||
    msgLower.includes("api-key-not-valid") ||
    msgLower.includes("invalid-api-key") ||
    code.includes("app-not-authorized")
  ) {
    return "Firebase is not setup yet. Please set up your Firebase project and add valid keys to your .env file (refer to .env.example).";
  }

  if (code.includes("project-not-found") || msgLower.includes("project-not-found")) {
    return "Firebase project was not found. Please check your VITE_FIREBASE_PROJECT_ID in .env.";
  }

  if (
    code.includes("operation-not-allowed") ||
    msgLower.includes("operation-not-allowed")
  ) {
    return "Email/Password authentication is not enabled in your Firebase project. Please enable it in the Firebase Console under Authentication > Sign-in method.";
  }

  // College domain restriction error
  if (msgLower.includes("college students") || msgLower.includes("@spit.ac.in")) {
    return rawMsg;
  }

  // Invalid credentials & user not found
  if (
    code.includes("invalid-credential") ||
    code.includes("user-not-found") ||
    code.includes("wrong-password")
  ) {
    return "Incorrect college email or password. Please verify and try again.";
  }

  // Already registered
  if (code.includes("email-already-in-use")) {
    return "An account with this college email already exists. Please sign in instead.";
  }

  // Password requirements
  if (code.includes("weak-password")) {
    return "Password is too weak. Please choose a password with at least 6 characters.";
  }

  // Invalid email format
  if (code.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }

  // Account disabled
  if (code.includes("user-disabled")) {
    return "This student account has been disabled. Please contact the administrator.";
  }

  // Rate limiting
  if (code.includes("too-many-requests")) {
    return "Too many failed attempts. Please wait a few moments before trying again.";
  }

  // Network problems
  if (code.includes("network-request-failed") || msgLower.includes("network")) {
    return "Network connection error. Please check your internet connection.";
  }

  // Google Sign-In & Popup errors
  if (code.includes("popup-closed-by-user")) {
    return "Google sign-in was cancelled before completion.";
  }
  if (code.includes("popup-blocked")) {
    return "The Google sign-in popup was blocked by your browser. Please allow popups for this site.";
  }
  if (code.includes("cancelled-popup-request")) {
    return "Google sign-in request was cancelled.";
  }
  if (code.includes("account-exists-with-different-credential")) {
    return "An account already exists with this email using a different sign-in method. Please sign in with email and password.";
  }

  // Return clean custom message if it doesn't contain raw Firebase internal syntax
  if (rawMsg && !rawMsg.startsWith("Firebase: Error")) {
    return rawMsg;
  }

  return "Authentication failed. Please verify your details or check your Firebase configuration in .env.";
}
