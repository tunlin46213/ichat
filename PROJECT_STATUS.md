# iChat — Project Status & Handoff

> **Session အသစ်စတိုင်း ဒီဖိုင်ကို အရင်ဖတ်ပါ။** ဘာလုပ်ပြီးပြီ၊ ဘာကျန်သေးလဲ၊ account/URL တွေ၊ build/deploy workflow တွေ အကုန် ဒီမှာ ရှိပါတယ်။
> Last updated: 2026-11-18 · Last commit: `ae27003`

---

## 1. Project အကျဉ်း

- **ဘာလဲ:** iPhone အတွက် 1:1 chat app (စာ၊ ပုံ၊ voice message၊ voice/video call)
- **ဘယ်သူတွေ သုံးမလဲ:** လူ **၃ ယောက်** (iPhone ပဲ၊ Android မရှိ)
- **Developer ပတ်ဝန်းကျင်:** Windows (Mac မရှိ)၊ VS Code၊ Claude Code
- **Budget:** **$0** — Apple Developer ($99) မဝယ်၊ Firebase Blaze (ကတ်) မသုံး
- **Repo:** https://github.com/tunlin46213/ichat (branch `main`)
- **Local path:** `E:\Depolyment\ios\ichat`
- **မူလ plan:** `E:\Depolyment\ios\chat-voice-app-plan.md`
- **User setup guide (Burmese):** [SETUP.md](SETUP.md)
- **User နဲ့ မြန်မာလို ပြောပါ။**

## 2. ရွေးထားတဲ့ လမ်းကြောင်း (အခမဲ့)

| လိုအပ်ချက် | သုံးထားတာ | ဘာကြောင့် |
|---|---|---|
| Backend | Firebase **Spark** (Auth + Firestore) | အခမဲ့ |
| ပုံ / voice သိမ်းတာ | **Firestore ထဲ base64** (`chats/{id}/media`) | Storage က Blaze လိုလို့ |
| Push ပို့တာ + call token | **Cloudflare Worker** (`worker/`) | Cloud Functions က Blaze လိုလို့ |
| Native iPhone app | **GitHub Actions** (macOS) က unsigned `.ipa` ထုတ် → **Sideloadly + free Apple ID** နဲ့ install | Mac နဲ့ $99 မရှိလို့ |
| Voice / video call | **Stream Video** (free tier) | |
| Web / PWA (backup) | Firebase Hosting (မ deploy ရသေး) | |

**Free Apple ID ကန့်သတ်ချက်:** ၇ ရက်တစ်ခါ refresh လုပ်ရ၊ **push notification မရ**၊ app ပိတ်ထားရင် ဖုန်းမဝင် (call က တစ်ဖက်လူ app ဖွင့်ထားမှ ရ)။

## 3. Tech stack

- Expo **SDK 58**, React Native 0.88, React 19.3, TypeScript, **React Compiler on**
- expo-router (typed routes, `src/app/`), NativeTabs (iOS) / headless tabs (web)
- Firebase JS SDK 13.4 (Auth with AsyncStorage persistence, Firestore **long polling**)
- `@stream-io/video-react-native-sdk` 1.47 (lazy-loaded; Expo Go / web မှာ မ load)
- reanimated 4, gesture-handler 3, expo-haptics, expo-audio, expo-image-picker, expo-image-manipulator, expo-file-system, expo-notifications, expo-clipboard, NetInfo
- Worker: Cloudflare Workers + wrangler 4

## 4. Services / Accounts / IDs

| Service | ID / URL | မှတ်ချက် |
|---|---|---|
| Firebase project | `ichat-2a37f` | Spark plan, Firestore region **asia-southeast1** |
| Firebase console | https://console.firebase.google.com/project/ichat-2a37f | |
| Firestore rules | https://console.firebase.google.com/project/ichat-2a37f/firestore/rules | [firestore.rules](firestore.rules) ကို paste → Publish |
| GitHub Actions | https://github.com/tunlin46213/ichat/actions | `iOS sideload build` |
| Cloudflare Worker | `https://ichat-push.tunlin-tlin-ac2.workers.dev` | name `ichat-push`, deployed ✅ |
| Stream app | API key `uc5wwkmp728q` (public, app.json ထဲ) | dashboard.getstream.io |
| Bundle ID | `com.tunlin.ichat` | |
| Web URL (မ deploy ရသေး) | https://ichat-2a37f.web.app | |

**Secrets (ဘယ်ဖိုင်ထဲမှမှ မထည့်ရ):**
| Secret | သိမ်းထားတဲ့နေရာ | အခြေအနေ |
|---|---|---|
| `STREAM_API_SECRET` | Cloudflare Worker secret | ✅ ထည့်ပြီး — ⚠️ chat ထဲမှာ ပေါက်ခဲ့လို့ **rotate လုပ်ရန် ကျန်** |
| `FIREBASE_SERVICE_ACCOUNT` | Cloudflare Worker secret | ❌ မထည့်ရသေး (web push အတွက်ပဲ လို) |

`app.json → expo.extra`: `pushWorkerUrl` ✅, `streamApiKey` ✅, `webPushVapidKey` ❌ (ဗလာ)

## 5. Build / Deploy workflow

### iPhone app (.ipa) build — အဓိက
1. Code ပြင် → `git push`
2. https://github.com/tunlin46213/ichat/actions/workflows/ios-sideload.yml → **Run workflow**
3. ~18 မိနစ် → Summary → **Artifacts → iChat-ipa** download → unzip → `iChat.ipa`
4. Windows: **iTunes + iCloud (Apple website version, Microsoft Store မဟုတ်) + Sideloadly** → iPhone USB ချိတ် → `.ipa` ဆွဲထည့် → Apple ID → Start
5. iPhone: Settings → General → VPN & Device Management → Trust; Privacy & Security → Developer Mode → On
- Workflow က `SIDELOAD=1` သုံးတယ် → [app.config.js](app.config.js) က `expo-notifications` plugin နဲ့ push entitlement ကို ဖယ်တယ် (free Apple ID sign လုပ်နိုင်အောင်)
- iPhone ကနေ တိုက်ရိုက် install / refresh ချင်ရင် **SideStore** (docs.sidestore.io) — ပထမဆုံး PC တစ်ခါ လို

### Cloudflare Worker
```
cd E:\Depolyment\ios\ichat\worker
npx wrangler deploy
npx wrangler secret put STREAM_API_SECRET        # value ကို terminal ထဲမှာပဲ paste
npx wrangler secret list
```
Endpoints: `POST /notify {chatId, body}`, `POST /stream-token` — နှစ်ခုလုံး `Authorization: Bearer <Firebase ID token>` လို (မပါရင် 401)

### Local dev
```
cd E:\Depolyment\ios\ichat
npx expo start -c            # Expo Go (calls/push မပါ)
npx expo start --tunnel      # network မတူရင်
```
Web: terminal မှာ `w` → browser ထဲ iPhone frame နဲ့ ပြ

### Web (PWA) deploy — optional, မလုပ်ရသေး
`firebase login` → `npm run deploy:web`

## 6. Code မပြင်ခင် / ပြင်ပြီး စစ်ရမယ့် command တွေ
```
npx tsc --noEmit
npx expo lint
npx expo export --platform ios --platform web --output-dir <scratchpad>/export   # bundle စစ်
npx expo-doctor
cd worker && npx tsc --noEmit && npx wrangler deploy --dry-run --outdir <scratchpad>/w
```
- Route အသစ်ထည့်ရင် typed routes ပြန်ထုတ်ဖို့: `CI=1 timeout 60 npx expo start --port 8099` (ပြီးရင် port 8099 node process ကို kill)
- Package ထည့်ရင် **`npx expo install`** ပဲ သုံး (AGENTS.md)
- Expo API တွေကို memory နဲ့ မရေးနဲ့ — `node_modules/.../*.d.ts` ဒါမှမဟုတ် docs.expo.dev v58 ကို စစ်

## 7. Repo structure (အရေးကြီးတာတွေ)

```
src/app/
  _layout.tsx               root Stack (Protected guards), providers, notification tap → chat
  index.tsx                 redirect → /chats or /login
  (tabs)/_layout.tsx        NativeTabs + unread badge     (_layout.web.tsx = web tab bar)
  (tabs)/chats/index.tsx    chat list (swipe delete, unread, typing, online dot)
  (tabs)/settings/          settings (name, photo, notifications[web], blocked, terms, logout, delete acct)
  chat/[id].tsx             chat screen (messages, menu, reply/edit, media, calls, read receipts)
  users.tsx                 new chat picker (modal)
  user/[id].tsx             contact sheet: block / report
  login / register / forgot-password / terms
src/components/chat/        message-bubble, composer (text/photo/voice/edit), message-menu,
                            media-content, typing-bubble, chat-header-title, linkified-text
src/context/                auth (presence heartbeat, verify email, delete acct), chats, blocks
src/calls/                  calls-provider(.native).tsx lazy-loads stream-calls.tsx; context.ts
src/lib/                    firebase, chat (data ops/formatting), media (base64 in Firestore),
                            push(.web).ts, notify (worker calls), moderation, haptics, confirm, runtime
public/                     PWA: index.html, manifest.json, icons, firebase-messaging-sw.js
worker/                     Cloudflare Worker (push + Stream token)
.github/workflows/ios-sideload.yml
firestore.rules, firebase.json, app.json, app.config.js, eas.json
```

## 8. Firestore data model

```
users/{uid}                 name, nameLower, avatarUrl (data: URI 256px), lastSeen, acceptedTermsAt
users/{uid}/private/push    tokens[] (Expo), fcmTokens[] (web)
blocks/{uid}                blocked[]                      (owner only)
reports/{id}                reporterId, reportedUserId, reason, chatId, messageId, messageText (create only)
chats/{uidA_uidB}           members[2] sorted, names{}, lastMessage, lastSenderId, updatedAt,
                            unread{uid:n}, lastRead{uid:ts}, typing{uid:ts}, hiddenAt{uid:ts}
chats/{id}/messages/{id}    type text|image|audio, text, senderId, createdAt, replyTo, reactions{uid:emoji},
                            editedAt, deleted, mediaId, mime, width, height, durationMs
chats/{id}/media/{id}       data (base64 ≤ ~900KB), mime, senderId, createdAt
```
Rules အဓိကချက်: chat members ပဲ ဖတ်/ရေး; block ထားရင် message create ပိတ်; reaction က ကိုယ့် key ပဲ; edit ၁၅ မိနစ်အတွင်း; unsend sender ပဲ; media က `existsAfter` (same batch)။

## 9. ပြီးပြီ ✅

- Auth: register (Terms checkbox) / login / logout / forgot password / email verification / delete account
- Chat: realtime 1:1, typing, presence (Active now), read receipts, unread badges, reply, edit, unsend, reactions, copy, links, time separators, pagination, scroll-to-bottom
- Media: photo (camera/library, compress), voice message (≤60s), profile photo
- Moderation: block/unblock, report (user/message), blocked list (App Store 1.2)
- UI: iOS native style (large titles, SF Symbols, haptics, animations, skeletons, swipe delete), web iPhone frame
- Calls: voice 📞 + video 🎥 via Stream (native build only)
- Infra: Worker deployed + Stream secret; GitHub Actions sideload build (**build #1 `dc1d148` ✅ 18 min**, call မပါ)

## 10. ကျန်သေးတာ / Next steps ⏳

- [ ] **Build #2 (`ae27003`, voice+video call ပါ)** — run နေတုန်း ရလဒ် စစ်ရန်
- [ ] **Firestore rules ကို console မှာ Publish** (user လုပ်ရ — လုပ်ပြီးမပြီး အတည်မပြုရသေး)
- [ ] Sideloadly နဲ့ iPhone ၂ လုံးမှာ install → chat / photo / voice / **call** ကို တကယ်စမ်း (Stream + SDK 58 မစမ်းရသေး)
- [ ] Stream secret **rotate** (dashboard regenerate → `wrangler secret put STREAM_API_SECRET`)
- [ ] (optional) Web push: VAPID key → `webPushVapidKey`; `FIREBASE_SERVICE_ACCOUNT` secret; `npm run deploy:web`
- [ ] Workflow ထဲ actions v4 → Node 24 compatible version update (Node 20 deprecation warning)
- [ ] မလုပ်ရသေးတဲ့ feature: chat ထဲ search, မြန်မာဘာသာ UI, group chat
- [ ] အနာဂတ် ($99 ဝယ်ရင်): EAS build, push (Expo), CallKit/VoIP ringing (`@stream-io/react-native-callingx` + `@react-native-firebase/*`), App Store/TestFlight

## 11. သိထားရမယ့် gotchas

- Firestore က RN မှာ default WebChannel နဲ့ "Could not reach backend" ဖြစ် → `experimentalForceLongPolling` (lib/firebase.ts)
- React Compiler lint: reanimated shared values ကို `.set()/.get()` သုံး; effect ထဲ sync setState မလုပ်
- Typed routes က `(tabs)/chats/index` ကို `/chats/index` လို့ ထုတ်တယ် → `'/chats' as Href` cast သုံး
- Stream SDK ကို top-level import လုပ်ရင် Expo Go crash → `calls-provider.native.tsx` က `require()` lazy
- `.web.tsx` / `.native.tsx` platform files သုံးထားတယ် (icon, phone-frame, web-header, push, calls)
- Windows: `gh` CLI မရှိ; Python ရှိ (multi-line patch တွေကို scratchpad ထဲ `.py` ရေးပြီး run); heredoc quoting သတိ
- Git: Windows LF→CRLF warning တွေ ပုံမှန်; commit message အဆုံးမှာ `Co-Authored-By` ထည့်
- `git push` / commit ကို user က ပြောမှ လုပ် (ဒီ project မှာ user က များသောအားဖြင့် "push" လို့ ပြောတယ်)
