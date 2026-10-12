import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { isFirebaseConfigured } from "../lib/firebase";
import { getFriendlyAuthErrorMessage } from "../lib/auth-errors";
import GoogleSignInButton from "./GoogleSignInButton";

interface LoginProps {
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
  onClose?: () => void;
}

export default function Login({ onSuccess, onSwitchToSignup, onClose }: LoginProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please fill in both email and password.");
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
      await login(email.trim(), password);
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
        <h2>Sign In</h2>
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      <p className="auth-subtitle">Sign in to track orders and checkout</p>

      {!isFirebaseConfigured && (
        <div className="auth-config-notice">
          ⚙️ <strong>Firebase Setup Required:</strong> To enable student accounts and database syncing, copy <code>.env.example</code> to <code>.env</code> with your Firebase credentials.
        </div>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}

      <GoogleSignInButton onSuccess={onSuccess} onError={setError} />

      <div className="auth-divider">
        <span>or sign in with email</span>
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
        </label>

        <label className="auth-label">
          Password
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? "Signing in..." : "Sign In with Email"}
        </button>
      </form>

      {onSwitchToSignup && (
        <div className="auth-footer">
          <span>Don't have an account? </span>
          <button type="button" className="auth-link-btn" onClick={onSwitchToSignup}>
            Create an account
          </button>
        </div>
      )}
    </div>
  );
}
