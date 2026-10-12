import { useState } from "react";
import Login from "./Login";
import Signup from "./Signup";

interface AuthModalProps {
  initialMode?: "login" | "signup";
  onClose: () => void;
  onSuccess?: () => void;
  titleNotice?: string;
}

export default function AuthModal({
  initialMode = "login",
  onClose,
  onSuccess,
  titleNotice,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

  function handleSuccess() {
    onSuccess?.();
    onClose();
  }

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        {titleNotice && (
          <div className="auth-notice-banner">
            <span>ℹ️</span> {titleNotice}
          </div>
        )}

        <div className="auth-tab-bar">
          <button
            type="button"
            className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === "signup" ? "active" : ""}`}
            onClick={() => setMode("signup")}
          >
            Register
          </button>
        </div>

        {mode === "login" ? (
          <Login
            onSuccess={handleSuccess}
            onSwitchToSignup={() => setMode("signup")}
            onClose={onClose}
          />
        ) : (
          <Signup
            onSuccess={handleSuccess}
            onSwitchToLogin={() => setMode("login")}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
