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

export function getAdminEmails(): string[] {
  const envEmails = import.meta.env?.VITE_ADMIN_EMAILS;
  if (!envEmails || typeof envEmails !== "string") {
    return [];
  }
  return envEmails
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const admins = getAdminEmails();
  return admins.includes(clean);
}

export function isVerifiedAdminUser(
  user?: { email?: string | null; emailVerified?: boolean } | null
): boolean {
  if (!user || !user.email || !user.emailVerified) {
    return false;
  }
  return isAdminEmail(user.email);
}

