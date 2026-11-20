import { router, type Href } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { toast } from '@/components/toast';
import { Radius, Semantic } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteUserAccount,
  dismissReport,
  fetchUsers,
  saveConfig,
  setUserDisabled,
  useConfigDoc,
  useIsAdmin,
  useReports,
  needsUpdate,
  newestPhoneBuild,
  type AdminUser,
  type AppConfig,
  type Invites,
} from '@/lib/admin';
import { formatPresence, isOnline } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { auth } from '@/lib/firebase';
import { buildSha, buildTime } from '@/lib/runtime';

type Section = 'overview' | 'users' | 'reports' | 'invites' | 'settings';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'reports', label: 'Reports' },
  { id: 'invites', label: 'Invites' },
  { id: 'settings', label: 'App settings' },
];


const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web' };

function shortDay(ms: number | null) {
  return ms ? new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
}

function day(ms: number | null) {
  return ms ? new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

/**
 * iChat admin dashboard (web). Only accounts listed in Firestore config/admins.uids get
 * in; the worker and the security rules check the same list for every action.
 */
export default function AdminScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const admin = useIsAdmin(user?.uid);

  if (Platform.OS !== 'web') {
    return (
      <Center>
        <Text style={[styles.h2, { color: theme.text }]}>Admin dashboard</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>Open iChat in a browser and go to /admin.</Text>
      </Center>
    );
  }
  if (admin === null) return <Center><ActivityIndicator /></Center>;
  if (!admin) {
    return (
      <Center>
        <Text style={[styles.h2, { color: theme.text }]}>No access</Text>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          {user?.email} is not an admin. Admins are listed in Firestore under config/admins.
        </Text>
        <LinkButton label="Back to iChat" onPress={() => router.replace('/chats' as Href)} />
      </Center>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const theme = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [section, setSection] = useState<Section>('overview');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reports = useReports(true);
  const invites = useConfigDoc<Invites>('invites', true);
  const appConfig = useConfigDoc<AppConfig>('app', true);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchUsers().then(
      (list) => !cancelled && (setLoadError(null), setUsers(list.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)))),
      (err: Error) => !cancelled && setLoadError(err.message)
    );
    return () => {
      cancelled = true;
    };
  }, [version]);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  const byUid = Object.fromEntries((users ?? []).map((u) => [u.uid, u]));
  const nameOf = (uid: string) => byUid[uid]?.name ?? byUid[uid]?.email ?? 'Deleted user';

  const content = {
    overview: <Overview users={users} reports={reports?.length ?? 0} invites={invites} go={setSection} />,
    users: <Users users={users} myUid={user!.uid} reload={load} />,
    reports: <Reports reports={reports} nameOf={nameOf} users={byUid} reload={load} />,
    invites: <InvitesPanel invites={invites} users={users} adminEmail={user?.email ?? null} />,
    settings: <Settings config={appConfig} />,
  }[section];

  return (
    <View style={[styles.page, { backgroundColor: theme.groupedBackground }]}>
      <View style={[styles.topbar, { backgroundColor: theme.card, borderBottomColor: theme.separator }]}>
        <Text style={[styles.brand, { color: theme.text }]}>
          iChat <Text style={{ color: theme.accent }}>Admin</Text>
        </Text>
        <View style={styles.topRight}>
          <Text style={[styles.muted, { color: theme.textSecondary }]} numberOfLines={1}>
            {user?.email}
          </Text>
          <LinkButton label="Open app" onPress={() => router.replace('/chats' as Href)} />
        </View>
      </View>

      <View style={[styles.body, wide ? styles.bodyWide : null]}>
        <View style={[wide ? styles.sidebar : styles.tabs]}>
          {SECTIONS.map((s) => {
            const selected = s.id === section;
            const badge = s.id === 'reports' && reports?.length ? reports.length : 0;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSection(s.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.navItem, selected && { backgroundColor: theme.backgroundSelected }]}>
                <Text style={[styles.navText, { color: selected ? theme.text : theme.textSecondary }]}>{s.label}</Text>
                {badge ? (
                  <View style={[styles.navBadge, { backgroundColor: Semantic.danger }]}>
                    <Text style={styles.navBadgeText}>{badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.main}>
          {loadError ? (
            <Panel>
              <Text style={{ color: Semantic.danger }}>Could not load accounts: {loadError}</Text>
              <LinkButton label="Try again" onPress={load} />
            </Panel>
          ) : null}
          {content}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({ users, reports, invites, go }: {
  users: AdminUser[] | null;
  reports: number;
  invites: Invites | null;
  go: (s: Section) => void;
}) {
  const theme = useTheme();
  const now = useNow(60_000);
  if (!users) return <ActivityIndicator style={styles.loading} />;
  const active = users.filter((u) => isOnline(u.lastSeen ? Timestamp.fromMillis(u.lastSeen) : null)).length;
  const today = users.filter((u) => u.lastSeen && now - u.lastSeen < 86_400_000).length;
  const disabled = users.filter((u) => u.disabled).length;
  const newest = newestPhoneBuild(users);
  const outdated = users.filter((u) => !u.disabled && u.hasProfile && needsUpdate(u, newest));
  const noAlerts = users.filter((u) => !u.disabled && u.hasProfile && !u.bark && !u.androidPush);
  const unverified = users.filter((u) => !u.emailVerified && !u.disabled);

  const tiles = [
    { label: 'Accounts', value: users.length, note: `${disabled} turned off` },
    { label: 'Active now', value: active, note: `${today} in the last 24 h` },
    { label: 'Open reports', value: reports, note: reports ? 'Needs review' : 'All clear', alert: reports > 0 },
    { label: 'Sign-up', value: invites?.enabled ? 'Invite-only' : 'Open', note: `${invites?.emails?.length ?? 0} invited emails` },
  ];

  const todo = [
    reports ? { text: `${reports} report${reports > 1 ? 's' : ''} to review`, go: 'reports' as Section } : null,
    outdated.length
      ? { text: `${outdated.map((u) => u.name ?? u.email).join(', ')} should install the newest phone build`, go: 'users' as Section }
      : null,
    noAlerts.length
      ? { text: `${noAlerts.map((u) => u.name ?? u.email).join(', ')} won't get alerts while iChat is closed`, go: 'users' as Section }
      : null,
    unverified.length ? { text: `${unverified.length} email${unverified.length > 1 ? 's' : ''} not verified`, go: 'users' as Section } : null,
    !invites?.enabled ? { text: 'Anyone with the app can register. Turn on invite-only.', go: 'invites' as Section } : null,
  ].filter((t): t is { text: string; go: Section } => !!t);

  return (
    <>
      <Text style={[styles.h1, { color: theme.text }]}>Overview</Text>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{t.label.toUpperCase()}</Text>
            <Text style={[styles.tileValue, { color: t.alert ? Semantic.danger : theme.text }]}>{t.value}</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>{t.note}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.h2, { color: theme.text }]}>Needs attention</Text>
      <Panel>
        {todo.length ? (
          todo.map((t, i) => (
            <View
              key={t.text}
              style={[styles.todo, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
              <View style={[styles.dot, { backgroundColor: Semantic.warning }]} />
              <Text style={[styles.flex, { color: theme.text }]}>{t.text}</Text>
              <LinkButton label="Open" onPress={() => go(t.go)} />
            </View>
          ))
        ) : (
          <Text style={{ color: theme.textSecondary }}>Nothing to do. Everyone is on the newest build with alerts set up.</Text>
        )}
      </Panel>
    </>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

function Users({ users, myUid, reload }: { users: AdminUser[] | null; myUid: string; reload: () => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  if (!users) return <ActivityIndicator style={styles.loading} />;
  const newest = newestPhoneBuild(users);

  async function run(uid: string, action: () => Promise<unknown>, done: string) {
    setBusy(uid);
    try {
      await action();
      toast.success(done);
      reload();
    } catch (err) {
      toast.error(`That didn't work: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <View style={styles.headRow}>
        <Text style={[styles.h1, { color: theme.text }]}>Users</Text>
        <LinkButton label="Refresh" onPress={reload} />
      </View>
      <Panel flush>
        <ScrollView horizontal contentContainerStyle={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tr, styles.th, { borderBottomColor: theme.separator }]}>
              {['Person', 'Device', 'Last seen', 'Alerts', 'Status', ''].map((h, i) => (
                <Text key={i} style={[styles.label, COLS[i], { color: theme.textSecondary }]}>
                  {h.toUpperCase()}
                </Text>
              ))}
            </View>
            {users.map((u) => {
              const me = u.uid === myUid;
              return (
                <View key={u.uid} style={[styles.tr, { borderBottomColor: theme.separator, opacity: u.disabled ? 0.6 : 1 }]}>
                  <View style={[COLS[0], styles.person]}>
                    <Avatar id={u.uid} name={u.name ?? u.email ?? '?'} size={34} />
                    <View style={styles.flex}>
                      <Text style={[styles.strong, { color: theme.text }]} numberOfLines={1}>
                        {u.name ?? '(no profile)'} {me ? <Text style={{ color: theme.accent }}>· you</Text> : null}
                      </Text>
                      <Text style={[styles.muted, { color: theme.textSecondary }]} numberOfLines={1}>
                        {u.email} {u.emailVerified ? '' : '· unverified'}
                      </Text>
                      <Text style={[styles.tiny, { color: theme.textSecondary }]}>Joined {day(u.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={COLS[1]}>
                    {u.devices.map((d) => {
                      const old = d.platform !== 'web' && !!newest && (d.buildTime ?? 0) < newest;
                      return (
                        <Text key={d.platform} style={{ color: old ? Semantic.warning : theme.text }} numberOfLines={1}>
                          {PLATFORM[d.platform] ?? d.platform}{' '}
                          <Text style={[styles.mono, { color: old ? Semantic.warning : theme.textSecondary }]}>
                            {d.build ?? '?'} · {shortDay(d.buildTime ? d.buildTime * 1000 : null)}
                          </Text>
                        </Text>
                      );
                    })}
                    {u.devices.some((d) => d.platform !== 'web') ? null : (
                      <Text style={{ color: Semantic.warning }}>Phone: older build</Text>
                    )}
                  </View>
                  <Text style={[COLS[2], { color: theme.text }]}>
                    {u.lastSeen ? formatPresence(Timestamp.fromMillis(u.lastSeen)) : 'Never'}
                  </Text>
                  <View style={[COLS[3], styles.chips]}>
                    {u.bark ? <Chip text="Bark" tone="ok" /> : null}
                    {u.androidPush ? <Chip text="Android" tone="ok" /> : null}
                    {u.quiet ? <Chip text="Quiet hours" /> : null}
                    {!u.bark && !u.androidPush ? <Chip text="None" tone="warn" /> : null}
                  </View>
                  <View style={COLS[4]}>
                    <Chip text={u.disabled ? 'Turned off' : 'Active'} tone={u.disabled ? 'bad' : 'ok'} />
                  </View>
                  <View style={[COLS[5], styles.actions]}>
                    {busy === u.uid ? (
                      <ActivityIndicator />
                    ) : me ? null : (
                      <>
                        {u.email ? (
                          <LinkButton
                            label="Reset password"
                            onPress={() =>
                              run(u.uid, () => sendPasswordResetEmail(auth, u.email!), `Reset email sent to ${u.email}`)
                            }
                          />
                        ) : null}
                        <LinkButton
                          label={u.disabled ? 'Turn on' : 'Turn off'}
                          onPress={() =>
                            u.disabled
                              ? run(u.uid, () => setUserDisabled(u.uid, false), `${u.name ?? u.email} can sign in again`)
                              : confirmDestructive({
                                  title: `Turn off ${u.name ?? u.email}?`,
                                  message: 'They are signed out within an hour and can’t sign in until you turn the account back on.',
                                  confirmLabel: 'Turn off',
                                  onConfirm: () => run(u.uid, () => setUserDisabled(u.uid, true), `${u.name ?? u.email} turned off`),
                                })
                          }
                        />
                        <LinkButton
                          label="Delete"
                          danger
                          onPress={() =>
                            confirmDestructive({
                              title: `Delete ${u.name ?? u.email}?`,
                              message:
                                'Deletes the account, profile, push setup and block list. Chats stay for the other person. This can’t be undone.',
                              confirmLabel: 'Delete',
                              onConfirm: () => run(u.uid, () => deleteUserAccount(u.uid), `${u.name ?? u.email} deleted`),
                            })
                          }
                        />
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </Panel>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>
        Orange: older than the newest phone build anyone runs. “Older build” means a phone app from before build
        tracking (it can’t report its version).
      </Text>
    </>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────

function Reports({ reports, nameOf, users, reload }: {
  reports: ReturnType<typeof useReports>;
  nameOf: (uid: string) => string;
  users: Record<string, AdminUser>;
  reload: () => void;
}) {
  const theme = useTheme();
  if (!reports) return <ActivityIndicator style={styles.loading} />;
  return (
    <>
      <Text style={[styles.h1, { color: theme.text }]}>Reports</Text>
      {reports.length === 0 ? (
        <Panel>
          <Text style={{ color: theme.textSecondary }}>No reports. When someone reports a person or a message, it shows up here.</Text>
        </Panel>
      ) : (
        reports.map((r) => {
          const target = users[r.reportedUserId];
          return (
            <Panel key={r.id}>
              <View style={styles.headRow}>
                <Text style={{ color: theme.text }}>
                  <Text style={styles.strong}>{nameOf(r.reporterId)}</Text> reported{' '}
                  <Text style={styles.strong}>{nameOf(r.reportedUserId)}</Text>
                </Text>
                <Chip text={r.reason} tone="warn" />
              </View>
              <Text style={[styles.tiny, { color: theme.textSecondary }]}>
                {r.createdAt ? r.createdAt.toDate().toLocaleString() : ''}
              </Text>
              {r.messageText ? (
                <Text style={[styles.quote, { color: theme.text, borderLeftColor: theme.separator }]}>“{r.messageText}”</Text>
              ) : (
                <Text style={[styles.muted, { color: theme.textSecondary }]}>Reported the person, not a message.</Text>
              )}
              <View style={styles.actions}>
                <LinkButton
                  label="Dismiss"
                  onPress={() => dismissReport(r.id).then(() => toast.success('Report dismissed'), () => toast.error('Could not dismiss it.'))}
                />
                {target && !target.disabled ? (
                  <LinkButton
                    label={`Turn off ${target.name ?? 'account'}`}
                    danger
                    onPress={() =>
                      confirmDestructive({
                        title: `Turn off ${target.name ?? target.email}?`,
                        message: 'They are signed out within an hour and can’t sign in until you turn the account back on.',
                        confirmLabel: 'Turn off',
                        onConfirm: () =>
                          setUserDisabled(target.uid, true).then(
                            () => {
                              toast.success('Account turned off');
                              reload();
                            },
                            () => toast.error('Could not turn it off.')
                          ),
                      })
                    }
                  />
                ) : null}
              </View>
            </Panel>
          );
        })
      )}
    </>
  );
}

// ── Invites ───────────────────────────────────────────────────────────────────

function InvitesPanel({ invites, users, adminEmail }: {
  invites: Invites | null;
  users: AdminUser[] | null;
  adminEmail: string | null;
}) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  if (!invites) return <ActivityIndicator style={styles.loading} />;
  const emails = invites.emails ?? [];

  function save(next: Invites, done: string) {
    saveConfig('invites', next).then(() => toast.success(done), () => toast.error('Could not save. Is the latest firestore.rules published?'));
  }

  function toggle(on: boolean) {
    if (on) {
      // Everyone who already has an account, and the admin, stays in.
      const keep = [...emails, ...(users ?? []).filter((u) => !u.disabled).map((u) => u.email), adminEmail]
        .filter((e): e is string => !!e)
        .map((e) => e.toLowerCase());
      save({ enabled: true, emails: [...new Set(keep)] }, 'Invite-only is on');
    } else {
      save({ enabled: false, emails }, 'Anyone can register again');
    }
  }

  function add() {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return toast.error('Enter a full email address, like name@gmail.com.');
    if (emails.includes(clean)) return toast.info('That email is already invited.');
    setEmail('');
    save({ ...invites, emails: [...emails, clean] }, `${clean} invited`);
  }

  return (
    <>
      <Text style={[styles.h1, { color: theme.text }]}>Invites</Text>
      <Panel>
        <View style={styles.headRow}>
          <View style={styles.flex}>
            <Text style={[styles.strong, { color: theme.text }]}>Invite-only</Text>
            <Text style={[styles.muted, { color: theme.textSecondary }]}>
              {invites.enabled
                ? 'Only the emails below can register and use iChat.'
                : 'Anyone who installs the app can register and message people.'}
            </Text>
          </View>
          <Switch
            value={!!invites.enabled}
            onValueChange={toggle}
            trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
          />
        </View>
      </Panel>
      <Text style={[styles.h2, { color: theme.text }]}>Invited emails</Text>
      <Panel>
        <View style={styles.addRow}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={add}
            placeholder="name@gmail.com"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, styles.grow, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <LinkButton label="Invite" onPress={add} solid />
        </View>
        {emails.length ? (
          emails.map((e, i) => {
            const account = users?.find((u) => u.email?.toLowerCase() === e);
            return (
              <View key={e} style={[styles.emailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
                <Text style={[styles.flex, { color: theme.text }]}>{e}</Text>
                {account ? <Chip text={account.name ?? 'Registered'} tone="ok" /> : <Chip text="Not registered yet" />}
                {e === adminEmail?.toLowerCase() ? null : (
                  <LinkButton
                    label="Remove"
                    danger
                    onPress={() => save({ ...invites, emails: emails.filter((x) => x !== e) }, `${e} removed`)}
                  />
                )}
              </View>
            );
          })
        ) : (
          <Text style={{ color: theme.textSecondary }}>No invited emails yet. Turning on invite-only adds everyone who has an account.</Text>
        )}
      </Panel>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>
        Removing an email doesn’t touch an existing account’s chats, but that person can no longer read or send
        anything. To stop someone right away, turn their account off in Users.
      </Text>
    </>
  );
}

// ── App settings (config/app) ─────────────────────────────────────────────────

function Settings({ config }: { config: AppConfig | null }) {
  const theme = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!config) return <ActivityIndicator style={styles.loading} />;
  const urlValue = url ?? config.pushWorkerUrl ?? '';
  const messageValue = message ?? config.updateMessage ?? '';
  const min = config.minBuildTime ?? 0;

  function save(data: AppConfig, done: string) {
    saveConfig('app', data).then(() => toast.success(done), () => toast.error('Could not save. Is the latest firestore.rules published?'));
  }

  return (
    <>
      <Text style={[styles.h1, { color: theme.text }]}>App settings</Text>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>Phones pick these up the next time iChat opens. No new build needed.</Text>

      <Text style={[styles.h2, { color: theme.text }]}>Required version</Text>
      <Panel>
        <Text style={{ color: theme.text }}>
          {min
            ? `Builds from before ${new Date(min * 1000).toLocaleString()} show an “Update iChat” banner.`
            : 'Off. No phone is asked to update.'}
        </Text>
        <View style={styles.actions}>
          {buildTime ? (
            <LinkButton
              label={`Require ${buildSha} (${day(buildTime * 1000)}) or newer`}
              solid
              onPress={() => save({ minBuildTime: buildTime! }, 'Older builds will be asked to update')}
            />
          ) : null}
          {min ? <LinkButton label="Turn off" onPress={() => save({ minBuildTime: 0 }, 'Update banner turned off')} /> : null}
        </View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>BANNER TEXT</Text>
        <TextInput
          value={messageValue}
          onChangeText={setMessage}
          multiline
          placeholder="A newer version of iChat is ready…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.area, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <View style={styles.actions}>
          <LinkButton label="Save text" onPress={() => save({ updateMessage: messageValue.trim() }, 'Banner text saved')} />
        </View>
      </Panel>

      <Text style={[styles.h2, { color: theme.text }]}>Notification server</Text>
      <Panel>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          The Cloudflare Worker that sends alerts and call tokens. Change it only after deploying a new worker.
        </Text>
        <TextInput
          value={urlValue}
          onChangeText={setUrl}
          autoCapitalize="none"
          style={[styles.input, styles.mono, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <View style={styles.actions}>
          <LinkButton
            label="Save address"
            onPress={() => {
              const clean = urlValue.trim().replace(/\/$/, '');
              if (!/^https:\/\/[^\s/]+$/.test(clean)) return toast.error('Use the worker’s https:// address, with nothing after the domain.');
              confirmDestructive({
                title: 'Change the notification server?',
                message: `Every phone will send alerts and calls through ${clean}. If it isn't set up, alerts and calls stop working.`,
                confirmLabel: 'Change',
                onConfirm: () => save({ pushWorkerUrl: clean }, 'Notification server changed'),
              });
            }}
          />
        </View>
      </Panel>
    </>
  );
}

// ── Small parts ───────────────────────────────────────────────────────────────

// Shares of the row, with minimum widths; narrower windows scroll the table sideways.
const COLS = [
  { flex: 2.2, minWidth: 230 },
  { flex: 1.4, minWidth: 160 },
  { flex: 1, minWidth: 110 },
  { flex: 1.3, minWidth: 130 },
  { flex: 0.8, minWidth: 90 },
  { flex: 2.6, minWidth: 300 },
] as const;

function Center({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.center, { backgroundColor: theme.groupedBackground }]}>{children}</View>;
}

function Panel({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, flush && styles.panelFlush, { backgroundColor: theme.card, borderColor: theme.separator }]}>
      {children}
    </View>
  );
}

function Chip({ text, tone }: { text: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const theme = useTheme();
  const color =
    tone === 'ok' ? Semantic.success : tone === 'warn' ? Semantic.warning : tone === 'bad' ? Semantic.danger : theme.textSecondary;
  return (
    <View style={[styles.chip, { backgroundColor: `${color}1F` }]}>
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  );
}

function LinkButton({ label, onPress, danger, solid }: { label: string; onPress: () => void; danger?: boolean; solid?: boolean }) {
  const theme = useTheme();
  const color = danger ? Semantic.danger : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        solid ? { backgroundColor: color } : { backgroundColor: hovered ? `${color}14` : 'transparent' },
        pressed && { opacity: 0.6 },
      ]}>
      <Text style={[styles.buttonText, { color: solid ? '#fff' : color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  sidebar: { width: 210, padding: 12, gap: 2 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 12, paddingTop: 10 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 36, borderRadius: 8 },
  navText: { fontSize: 15, fontWeight: '600' },
  navBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  navBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  main: { padding: 20, gap: 12, maxWidth: 1200, width: '100%' },
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  muted: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 12 },
  strong: { fontWeight: '700' },
  mono: { fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: undefined }), fontSize: 12 },
  loading: { marginTop: 40 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: 200, borderRadius: Radius.lg, padding: 16, gap: 4 },
  tileValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panel: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  panelFlush: { padding: 0 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  tableScroll: { flexGrow: 1 },
  table: { flex: 1, minWidth: 1080 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { paddingVertical: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center', alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  button: { paddingHorizontal: 10, height: 32, borderRadius: 8, justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600' },
  quote: { borderLeftWidth: 3, paddingLeft: 10, fontSize: 15 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    alignSelf: 'stretch',
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  area: { height: 72, paddingTop: 10 },
  grow: { flex: 1 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
