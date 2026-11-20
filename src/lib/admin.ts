import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase';
import { post } from '@/lib/notify';

/**
 * Web admin dashboard data. Who is an admin: Firestore config/admins.uids (set in the
 * console). Account actions go through the push worker (it holds the service account
 * and checks the same list); the rest is plain Firestore, guarded by the rules.
 */

export function useIsAdmin(uid: string | undefined) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'config', 'admins'),
      (snap) => setAdmin(((snap.get('uids') as string[] | undefined) ?? []).includes(uid)),
      () => setAdmin(false)
    );
  }, [uid]);
  return uid ? admin : false;
}

export type AdminUser = {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: number | null;
  lastLoginAt: number | null;
  lastSeen: number | null;
  hasProfile: boolean;
  /** each platform this person uses iChat on; empty = only builds from before tracking */
  devices: { platform: string; build: string | null; buildTime: number | null; at: number | null }[];
  androidPush: number;
  bark: boolean;
  quiet: boolean;
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await post(path, body ?? {});
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const fetchUsers = () => call<{ users: AdminUser[] }>('/admin/users').then((r) => r.users);
export const setUserDisabled = (uid: string, disabled: boolean) => call('/admin/user/disable', { uid, disabled });
export const deleteUserAccount = (uid: string) => call('/admin/user/delete', { uid });

export type Report = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  chatId: string | null;
  messageId: string | null;
  messageText: string | null;
  createdAt: Timestamp | null;
};

export function useReports(enabled: boolean) {
  const [reports, setReports] = useState<Report[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
      (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report)),
      () => setReports([])
    );
  }, [enabled]);
  return reports;
}

export const dismissReport = (id: string) => deleteDoc(doc(db, 'reports', id));

/** config/app and config/invites, live. */
export function useConfigDoc<T extends object>(id: 'app' | 'invites', enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'config', id),
      (snap) => setData((snap.data() as T | undefined) ?? ({} as T)),
      () => setData({} as T)
    );
  }, [id, enabled]);
  return data;
}

export const saveConfig = (id: 'app' | 'invites', data: object) => setDoc(doc(db, 'config', id), data, { merge: true });

export type Invites = { enabled?: boolean; emails?: string[] };
export type AppConfig = { pushWorkerUrl?: string; minBuildTime?: number; updateMessage?: string };

/** Phone builds only: the web dashboard runs whatever is checked out on the computer. */
export function newestPhoneBuild(users: AdminUser[]) {
  return Math.max(
    0,
    ...users.flatMap((u) => u.devices.filter((d) => d.platform !== 'web').map((d) => d.buildTime ?? 0))
  );
}

/** Uses iChat on a phone, but not on the newest phone build (or on one from before tracking). */
export function needsUpdate(u: AdminUser, newest: number) {
  const phones = u.devices.filter((d) => d.platform !== 'web');
  if (!phones.length) return true;
  return !!newest && phones.some((d) => (d.buildTime ?? 0) < newest);
}
