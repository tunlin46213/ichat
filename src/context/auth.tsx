import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { auth, db } from '@/lib/firebase';

type AuthContextValue = {
  user: User | null;
  /** Kept separately because Firebase mutates `user` in place when the profile changes. */
  displayName: string | null;
  /** true until Firebase has restored (or ruled out) a saved session */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [displayName, setDisplayName] = useState<string | null>(
    auth.currentUser?.displayName ?? null
  );
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setDisplayName(u?.displayName ?? null);
      setInitializing(false);
    });
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async function register(name: string, email: string, password: string) {
    const cleanName = name.trim();
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    // onAuthStateChanged has already fired with no name; set it now.
    setDisplayName(cleanName);
    await updateProfile(cred.user, { displayName: cleanName });
    // Public profile used by the user list. Email is intentionally not stored here,
    // because every signed-in user can read this collection.
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: cleanName,
      nameLower: cleanName.toLowerCase(),
      avatarUrl: null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext value={{ user, displayName, initializing, signIn, register, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Turns Firebase error codes into short messages for the user. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Email format is not valid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in the Firebase console.';
    case 'permission-denied':
      return 'Account created, but saving the profile was blocked by Firestore rules.';
    default:
      return code ? `Something went wrong (${code}).` : 'Something went wrong.';
  }
}
