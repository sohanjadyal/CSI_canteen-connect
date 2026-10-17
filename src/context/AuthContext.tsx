import React, { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { isCollegeEmail, isVerifiedAdminUser } from "../lib/auth-validation";

export interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signup: (email: string, password: string) => Promise<UserCredential>;
  login: (email: string, password: string) => Promise<UserCredential>;
  loginWithGoogle: () => Promise<UserCredential>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function signup(email: string, password: string): Promise<UserCredential> {
    const cleanEmail = email.trim().toLowerCase();
    if (!isCollegeEmail(cleanEmail)) {
      throw new Error("Registration is restricted to college students (@spit.ac.in).");
    }
    return createUserWithEmailAndPassword(auth, cleanEmail, password);
  }

  async function login(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async function loginWithGoogle(): Promise<UserCredential> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: "spit.ac.in",
      prompt: "select_account",
    });

    const result = await signInWithPopup(auth, provider);
    const email = result.user.email?.trim().toLowerCase() || "";
    if (!isCollegeEmail(email)) {
      await signOut(auth);
      throw new Error("Registration is restricted to college students (@spit.ac.in).");
    }
    return result;
  }

  async function logout(): Promise<void> {
    return signOut(auth);
  }

  const isAdmin = isVerifiedAdminUser(user);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signup, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
