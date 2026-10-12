import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { isFirebaseConfigured } from "../lib/firebase";
import { getFriendlyAuthErrorMessage } from "../lib/auth-errors";
import GoogleSignInButton from "./GoogleSignInButton";

interface SignupProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
  onClose?: () => void;
}

export default function Signup({ onSuccess, onSwitchToLogin, onClose }: SignupProps) {
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    // Strict validation rule ensuring user registers with college email (@spit.ac.in)
    if (!cleanEmail.endsWith("@spit.ac.in")) {
      setError("Registration is restricted to college students (@spit.ac.in).");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!isFirebaseConfigured) {
      setError(
        "Firebase is not setup yet. Please set up your Firebase project and add valid keys to your .env file (refer to .env.example)."
      );
      return;
    }

    setLoading(true);
    try {
      await signup(cleanEmail, password);
      onSuccess?.();
    } catch (err: unknown) {
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-container">
      <div className="auth-header">
        <h2>Student Registration</h2>
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      <p className="auth-subtitle">Create an account with your @spit.ac.in email</p>

      {!isFirebaseConfigured && (
        <div className="auth-config-notice">
          ⚙️ <strong>Firebase Setup Required:</strong> To enable student accounts and database syncing, copy <code>.env.example</code> to <code>.env</code> with your Firebase credentials.
        </div>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}

      <GoogleSignInButton
        onSuccess={onSuccess}
        onError={setError}
        label="Register with Google (@spit.ac.in)"
      />

      <div className="auth-divider">
        <span>or register with email</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-label">
          College Email
          <input
            type="email"
            placeholder="john.doe24@spit.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <small className="auth-hint">Format: name.surnameYY@spit.ac.in (e.g. john.doe24@spit.ac.in)</small>
        </label>

        <label className="auth-label">
          Password
          <input
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        <label className="auth-label">
          Confirm Password
          <input
            type="password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? "Creating account..." : "Sign Up with Email"}
        </button>
      </form>

      {onSwitchToLogin && (
        <div className="auth-footer">
          <span>Already have an account? </span>
          <button type="button" className="auth-link-btn" onClick={onSwitchToLogin}>
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
