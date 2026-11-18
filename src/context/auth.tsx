import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { auth, db } from '@/lib/firebase';
import { registerForPush, unregisterPush } from '@/lib/push';

const HEARTBEAT_MS = 60_000;

type AuthContextValue = {
  user: User | null;
  /** Kept separately because Firebase mutates `user` in place when the profile changes. */
  displayName: string | null;
  /** true until Firebase has restored (or ruled out) a saved session */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  /** Permanently deletes the account and profile. Needs the password to re-authenticate. */
  deleteAccount: (password: string) => Promise<void>;
  /** false until the user clicks the link in the verification email */
  emailVerified: boolean;
  resendVerification: () => Promise<void>;
  /** Re-checks emailVerified with the server (after the user clicked the link). */
  refreshUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** true right after sign-up, until the welcome steps are finished or skipped */
  needsOnboarding: boolean;
  finishOnboarding: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function writeProfile(uid: string, name: string) {
  return setDoc(
    doc(db, 'users', uid),
    { name, nameLower: name.toLowerCase(), lastSeen: serverTimestamp() },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [displayName, setDisplayName] = useState<string | null>(
    auth.currentUser?.displayName ?? null
  );
  const [initializing, setInitializing] = useState(true);
  const [emailVerified, setEmailVerified] = useState(auth.currentUser?.emailVerified ?? false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setDisplayName(u?.displayName ?? null);
      setEmailVerified(u?.emailVerified ?? false);
      setInitializing(false);
      // Repairs accounts whose profile write failed at sign-up (e.g. rules not yet
      // published) and refreshes lastSeen. Right after register() the name is not
      // set yet; register() writes the profile itself in that case.
      if (u?.displayName) {
        writeProfile(u.uid, u.displayName).catch((err) =>
          console.warn('Could not update profile', err)
        );
      }
    });
  }, []);

  // Presence: refresh lastSeen every minute while the app is open, and when it
  // returns to the foreground. Others show "Active now" if it is under 2 minutes old.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    // Ask for notification permission and save this device's push token.
    registerForPush(uid);
    const beat = () => {
      if (AppState.currentState !== 'active') return;
      setDoc(doc(db, 'users', uid), { lastSeen: serverTimestamp() }, { merge: true }).catch(
        () => {}
      );
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      beat();
      // Picks up email verification done in the mail app while we were away.
      const current = auth.currentUser;
      if (current && !current.emailVerified) {
        current.reload().then(() => setEmailVerified(current.emailVerified), () => {});
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [uid]);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async function register(name: string, email: string, password: string) {
    const cleanName = name.trim();
    // Set before the account exists: onAuthStateChanged fires mid-way through sign-up,
    // and the navigator must go straight to the welcome steps, not flash the chat list.
    setNeedsOnboarding(true);
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setNeedsOnboarding(false);
      throw err;
    }
    // onAuthStateChanged has already fired with no name; set it now.
    setDisplayName(cleanName);
    await updateProfile(cred.user, { displayName: cleanName });
    // Public profile used by the user list. Email is intentionally not stored here,
    // because every signed-in user can read this collection.
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: cleanName,
      nameLower: cleanName.toLowerCase(),
      avatarUrl: null,
      acceptedTermsAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
    // Not awaited: a slow or failed email must not block sign-up.
    sendEmailVerification(cred.user).catch((err) =>
      console.warn('Could not send verification email', err)
    );
  }

  async function logout() {
    setNeedsOnboarding(false);
    if (auth.currentUser) await unregisterPush(auth.currentUser.uid);
    await signOut(auth);
  }

  async function updateName(name: string) {
    const current = auth.currentUser;
    if (!current) return;
    const cleanName = name.trim();
    await updateProfile(current, { displayName: cleanName });
    await writeProfile(current.uid, cleanName);
    setDisplayName(cleanName);
  }

  async function resendVerification() {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }

  async function refreshUser() {
    const current = auth.currentUser;
    if (!current) return;
    await current.reload();
    setEmailVerified(current.emailVerified);
  }

  async function sendPasswordReset(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  async function deleteAccount(password: string) {
    const current = auth.currentUser;
    if (!current?.email) return;
    // Firebase requires a recent sign-in before deleting an account.
    await reauthenticateWithCredential(
      current,
      EmailAuthProvider.credential(current.email, password)
    );
    await deleteDoc(doc(db, 'users', current.uid));
    await deleteUser(current);
  }

  return (
    <AuthContext
      value={{
        user,
        displayName,
        initializing,
        signIn,
        register,
        logout,
        updateName,
        deleteAccount,
        emailVerified,
        resendVerification,
        refreshUser,
        sendPasswordReset,
        needsOnboarding: needsOnboarding && !!user,
        finishOnboarding: () => setNeedsOnboarding(false),
      }}>
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
    case 'auth/requires-recent-login':
      return 'For security, please log out and log in again, then retry.';
    case 'auth/missing-email':
      return 'Enter your email address.';
    case 'name-too-long':
      return 'Name must be 40 characters or fewer.';
    case 'permission-denied':
      return 'This action was blocked by the database security rules.';
    default:
      return code ? `Something went wrong (${code}).` : 'Something went wrong.';
  }
}
