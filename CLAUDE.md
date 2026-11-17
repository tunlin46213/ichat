# iChat — instructions for Claude

Read these first, every session:
- @PROJECT_STATUS.md — current state, accounts/URLs, what's done, what's next, workflows, gotchas
- @AGENTS.md — Expo SDK 58 rules (verify APIs, use `npx expo install`, run lint + typecheck)

Working rules for this project:
- Reply to the user in **Burmese (Myanmar)**; keep code, comments and commit messages in English.
- Budget is **$0**: no Firebase Blaze, no Apple Developer account. Native iPhone builds come from the
  GitHub Actions sideload workflow (`.github/workflows/ios-sideload.yml`) + Sideloadly.
- Never write secrets (Stream secret, Firebase service account) into files or commits. They live in
  Cloudflare Worker secrets only.
- Before saying a change is done: `npx tsc --noEmit`, `npx expo lint`, and a bundle export
  (`npx expo export --platform ios --platform web`). For `worker/`: `npx tsc --noEmit` there.
- Firestore rule changes must be published by the user in the console — always remind them.
- After finishing a chunk of work, update the checklist in PROJECT_STATUS.md.
