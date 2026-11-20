/**
 * Work that must run while the user is still signed in, just before signing out —
 * e.g. telling Stream to stop sending this phone call rings for the account
 * (src/calls/android-ringing.ts). Lives here so auth doesn't import the call SDK.
 */
type Hook = () => Promise<unknown>;
const hooks = new Set<Hook>();

export function onBeforeLogout(hook: Hook) {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Runs every hook; a failing or slow one (8 s) never blocks signing out. */
export async function runBeforeLogout() {
  const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
  await Promise.race([Promise.allSettled([...hooks].map((h) => h())), timeout]);
}
