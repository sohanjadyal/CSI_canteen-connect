/**
 * Validates that an email is a college email ending with @spit.ac.in
 */
export function isCollegeEmail(email: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith("@spit.ac.in");
}

export function validateSignupEmail(email: string): { valid: boolean; error?: string } {
  if (!email || !email.trim()) {
    return { valid: false, error: "Email is required." };
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.endsWith("@spit.ac.in")) {
    return { valid: false, error: "Registration is restricted to college students (@spit.ac.in)." };
  }
  return { valid: true };
}
