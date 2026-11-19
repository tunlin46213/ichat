# iChat — Project Status & Handoff

> **Session အသစ်စတိုင်း ဒီဖိုင်ကို အရင်ဖတ်ပါ။** ဘာလုပ်ပြီးပြီ၊ ဘာကျန်သေးလဲ၊ account/URL တွေ၊ build/deploy workflow တွေ အကုန် ဒီမှာ ရှိပါတယ်။
> Last updated: 2026-11-18 · Last commit: `d544879`

---

## 1. Project အကျဉ်း

- **ဘာလဲ:** iPhone အတွက် 1:1 chat app (စာ၊ ပုံ၊ voice message၊ voice/video call)
- **ဘယ်သူတွေ သုံးမလဲ:** လူ **၃ ယောက်** (iPhone ပဲ၊ Android မရှိ)
- **Developer ပတ်ဝန်းကျင်:** **Arch Linux** (2026-11-18 ကစ; အရင် Windows)၊ VS Code၊ Claude Code — sideload ကို **Impactor** (Flatpak) နဲ့
- **Budget:** **$0** — Apple Developer ($99) မဝယ်၊ Firebase Blaze (ကတ်) မသုံး
- **Repo:** https://github.com/tunlin46213/ichat (branch `main`)
- **Local path:** `/home/lynn/ichat` (Linux) · အရင် `E:\Depolyment\ios\ichat` (Windows)
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
  (tabs)/settings/          settings (profile hero, appearance, starred, notifications[web], blocked, terms, logout, delete acct)
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
                            unread{uid:n}, lastRead{uid:ts}, typing{uid:ts}, hiddenAt{uid:ts}, pinned{id,text,senderId},
                            pinnedAt{uid:ts}, archivedAt{uid:ts}   (per-user list pin / archive)
                            live{uid: {lat, lng, at, until, messageId}}   (live location, updated while app open)
chats/{id}/messages/{id}    type text|image|audio|call|location, text, senderId, createdAt, replyTo, reactions{uid:emoji}, thumb (image blur-up),
                            editedAt, deleted, mediaId, mime, width, height, durationMs, waveform[],
                            callType voice|video, callStatus answered|missed, lat, lng, liveUntil, forwarded
users/{uid}/private/starred items{chatId__messageId: {chatId, messageId, otherId, otherName, senderId, preview, starredAt}}
chats/{id}/media/{id}       data (base64 ≤ ~900KB), mime, senderId, createdAt
stories/{id}                ownerId, kind photo|text, text?, background?, width, height, createdAt, expiresAt (+24h), viewers{uid:ts}
                            reactions{uid:emoji}
storyMedia/{id}             ownerId, data (base64 1080px JPEG), mime   (same id as the story)
```
Rules အဓိကချက်: chat members ပဲ ဖတ်/ရေး; block ထားရင် message create ပိတ်; reaction က ကိုယ့် key ပဲ; edit ၁၅ မိနစ်အတွင်း; unsend sender ပဲ; media က `existsAfter` (same batch)။

## 9. ပြီးပြီ ✅

- Auth: register (Terms checkbox) / login / logout / forgot password / email verification / delete account
- Chat: realtime 1:1, typing, presence (Active now), read receipts, unread badges, reply, edit, unsend, reactions, copy, links, time separators, pagination, scroll-to-bottom
- Media: photo (camera/library, compress), voice message (≤60s), profile photo
- Moderation: block/unblock, report (user/message), blocked list (App Store 1.2)
- UI: iOS native style (large titles, SF Symbols, haptics, animations, skeletons, swipe delete), web iPhone frame
- Calls: voice 📞 + video 🎥 via Stream (native build only)
- Infra: Worker deployed + Stream secret; GitHub Actions sideload build (**build #1 `dc1d148` ✅ 18 min**, call မပါ; **build #2 `ae27003` ✅ 15 min, `iChat.ipa` 23.8 MB**, voice+video call ပါ)

## 10. ကျန်သေးတာ / Next steps ⏳

- [x] **Build #2 (`ae27003`, voice+video call ပါ)** — ✅ Success (14m 58s, artifact `iChat-ipa` 23.8 MB)
- [ ] **Firestore rules ကို console မှာ Publish** (user လုပ်ရ — လုပ်ပြီးမပြီး အတည်မပြုရသေး)
- [x] iPhone မှာ install ပြီး (Arch Linux → **Impactor** Flatpak; ဖုန်းအရင်ချိတ်ပြီးမှ Impactor ဖွင့်) — chat / voice message ✅
- [ ] **Call failed** (build #2) — အဓိကအကြောင်းရင်း: `getOrCreateInstance` race (profile load → effect re-run → disconnect ဖြစ်နေတဲ့ client ကို ပြန်ရ). Fix: deps `[uid, name]`, ယခင် disconnect ပြီးမှ client အသစ်; Stream `image` မပို့တော့; alert ထဲ error ပြ → build #3 နဲ့ ပြန်စမ်းရန်
- [x] Chat screen: iOS 26 transparent header ကြောင့် message တွေ header နောက်ထိရောက် + keyboard ကွက်လပ် → `headerTransparent: false` (build #3 မှာ အတည်ပြုရန်)
- [x] Bug sweep (build #3 မှာ အတည်ပြုရန်): voice message silent mode မှာ အသံမထွက် → play မတိုင်ခင် `playsInSilentMode`; Stream client ချိတ်တိုင်း app tree remount (navigation reset) → `<StreamVideo>` ကို call UI ပဲ wrap; `ensureChat` က တစ်ဖက်လူနာမည်ကို ဗလာ/`User` နဲ့ overwrite မလုပ်တော့
- [ ] Worker `/notify`: service account မရှိရင် 500 အစား `{sent:0}` — **`npx wrangler deploy` လုပ်ရန်**
- [x] **Upgrade (2026-11-18, build #3 မှာ အတည်ပြုရန်):** in-app message banner + chime (push မရလို့); swipe-to-reply + double-tap ❤️; call history message (`type: 'call'`, caller က call ပြီးရင် ရေး); real voice waveform + 1x/1.5x/2x; chat list contacts row + ✓✓ read tick; Appearance (bubble color + wallpaper, AsyncStorage); link preview (native only); Settings profile hero; chat ထဲ search; pin message; forward; star (`users/{uid}/private/starred`); ပုံ ၁၀ ပုံအထိ တစ်ခါတည်း; location (`expo-location`, `type: 'location'`)
- [x] Upgrade bug sweep: unsend/edit လုပ်ရင် pinned bar လိုက်ပြင်; search လုပ်နေတုန်း composer ဖျောက်; modal ပိတ်ပြီးမှ picker/alert/screen ဖွင့် (`afterModalClose`, iOS 350ms); account ပြောင်းရင် chat list အဟောင်း မပေါ် (uid-tagged state); ပုံတစ်ပုံ fail ရင် ကျန်တာ ဆက်ပို့; waveform sample ထပ်မနေ; voice ရပ်ရင် silent mode ပြန်လေးစား (chime)
- [x] Premium UI pass: chat list story-ring contacts row (online = gradient ring, unread badge), icon read ticks, MESSAGES section; Settings hero (gradient cover, avatar ring, camera button ကနေပဲ photo ပြောင်း — "Change Photo" row ဖြုတ်)
- [x] Chat list premium v2: header ဘယ်ဘက်မှာ ကိုယ့် avatar (→ Settings); All/Unread/Online filter chips; preview မှာ emoji အစား icon (missed call အနီ); online ring pulse animation (reduce motion လေးစား); profiles ကို `useUserProfiles` နဲ့ တစ်ခါတည်း ယူ
- [x] Chat screen premium (build #3 မှာ အတည်ပြုရန်): hold-to-record mic (ဖိ=record, လွှတ်=ပို့, ဘယ်ဆွဲ=cancel); photo viewer (pinch/double-tap zoom, အောက်ဆွဲပိတ်, ဘေးတိုက်လှန်, Save to Photos — `expo-media-library` အသစ်); Liquid Glass composer + gradient send + emoji panel; double-tap ❤️ burst + reaction pill pop + who-reacted sheet; Messenger-style seen avatar
- ⚠️ Gesture hook config (`usePanGesture({...})` စသည်) ထဲမှာ object spread မသုံးရ — worklets Babel plugin က bundle ကို fail စေတယ် (`npx expo export` မှ ဖမ်းမိ)
- [x] Double-check (chat screen premium): ၆၀s limit ပြည့်ပို့ပြီးမှ hint အမှားမပေါ်; photo viewer counter/Save က web မှာ page မှန် (onScroll); double-tap ❤️ ကို text message ပဲ (call bubble မှာ call မစ); chat preview icon ကို app ထုတ်တဲ့ preview အတိအကျပဲ ကိုက်
- [x] **Premium UI v3 (2026-11-18, build #4 မှာ အတည်ပြုရန်; uncommitted):** Login/Register/Forgot — gradient + floating blobs, animated logo, frosted card (`expo-blur` အသစ်), field icon + password eye, strength meter; **Onboarding** (`src/app/onboarding.tsx`, register ပြီးမှ — photo → name → tips; `needsOnboarding` in auth, Protected guard); **Contact profile** — gradient hero, Call/Video/Search/Mute, Shared Photos/Voice/Links (latest 300 msgs, client-side filter, index မလို), per-chat theme; **Per-chat theme + mute** (`ChatAppearanceScope`, AsyncStorage `chats{}`; mute = banner/chime မပြ, chat list 🔕); **ကိုယ်ပိုင် call screen** (`src/calls/call-screen.tsx`: blurred photo bg, ripple, glass buttons, PiP, timer, speaker; `custom.video` flag in call data; တစ်ဖက်ချရင် auto leave); **iOS long-press menu** (blur + bubble နေရာမှာ lift, `measureInWindow`); send fly-up animation + `send.wav` whoosh (silent switch လေးစား); scroll လုပ်ရင် floating day pill
- [x] **Stories (2026-11-18, build #4 မှာ အတည်ပြုရန်; uncommitted):** chat list row မှာ "Your Story ➕" (Camera/Photo/Text); gradient ring = မကြည့်ရသေး, မီးခိုး = ကြည့်ပြီး, အစိမ်းစက် = online; `story/new` (photo+caption / text+gradient bg), `story/[uid]` viewer (5s progress, tap ဘယ်/ညာ, ဖိ=pause, အောက်ဆွဲ=ပိတ်, reply/emoji → chat ထဲ `replyTo {id: story_…}`, ကိုယ့် story မှာ Seen by + Delete, **reactions** (`reactions{uid:emoji}`, quick 6 + `+` 24 emoji, floating burst, Seen-by sheet မှာ emoji filter chips), နောက်တစ်ယောက်ဆီ auto ဆက်); `StoriesProvider` (expiresAt > now live query; ၂၄ နာရီ app ဘက်က ဖျောက်; ကိုယ့် story အဟောင်းကို app ဖွင့်တိုင်း ဖျက်); **rules အသစ် (`stories`, `storyMedia`) → console မှာ Publish လို**
- [x] Network fixes: ConnectingScreen (splash ၃s ကျော်), tab "0" badge (`hidden` မအလုပ်လုပ် → conditional render), offline ဗလာ cache ကို "No Conversations" မပြ
- [x] **Enterprise UI pass (2026-11-18, uncommitted):** (1) design tokens `Semantic/Radius/Type/Elevation/Motion` in `constants/theme.ts`, `useTheme()` က `accent`, `danger`… ပါ ပြန်ပေး; cards → `Radius.md` + `Elevation.card`; (2) Appearance: Theme System/Light/Dark (`useResolvedColorScheme`, native `Appearance.setColorScheme`), Accent color = bubble color (app-wide: tabs, links, buttons, nav), Text size XS–XL (`textScale`: bubble/quote/composer/list); (3) bubble ထဲ အချိန် + ✓ / ✓✓ (read) / 🕓 (sending), edited/★ ပါ; ပုံ/map ပေါ်မှာ pill; "Sending…/Delivered" စာသား ဖြုတ်; (4) `components/toast.tsx` (`toast.success/error/info`) — copy/pin/star/forward/mute/archive/errors; (5) chat pin (`pinnedAt.{uid}`, max 5) + archive (`archivedAt.{uid}`, Archived row) + mark unread — chat doc fields, rules ပြောင်းစရာမလို; (6) swipe ညာ→ Unread/Pin, ဘယ်→ Mute/Archive/Delete; (7) drafts (`lib/drafts.ts`, AsyncStorage) — chat list မှာ "Draft:" အနီ
- [x] **Aurora Glass design (2026-11-18, uncommitted):** `components/aurora.tsx` (accent/pink/purple radial glow), theme tokens `glass/glassStrong/glassCard/glassBorder/glassHairline`; chat list → glass card rows (radius 24, unread = accent border + glow + ဘယ်ဘက် bar, pinned 📌 top row), greeting ("Good evening, Tun 👋" + unread/active summary), story ring 76px, glass chips/search; Settings → aurora + glass cards; iOS chats/settings header `headerTransparent` + blur; web tab bar frosted
- [x] **Chat screen aurora + smart (2026-11-18, uncommitted):** "Glow" wallpaper (accent radial, **default** — saved 'none' ရှိရင် Appearance မှာ Glow ရွေး); chat header `headerTransparent` + blur, content `paddingTop: headerHeight` (inverted list header အောက်မဝင်), KAV offset 0; **smart replies** (`lib/smart-replies.ts` EN+မြန်မာ keyword rules, image/voice/location/missed call; composer အပေါ် chips; draft ရှိရင်/reply/edit လုပ်နေရင် မပြ); **unread divider + jump** (ဖွင့်ချိန် unread count မှတ်, ≥6 ဆို scroll); chat list **Pinned / Today / Earlier** section headers
- [x] **Smart design pass (2026-11-18, uncommitted):** (1) message effects (`lib/effects.ts` + `chat/screen-effect.tsx`: 🎈 birthday/မွေးနေ့, 🎉 congrats/ဂုဏ်ယူ, 🎆 new year, ❤️ love/ချစ်တယ်; chat ဖွင့်ထားတုန်း message အသစ်တစ်ခါပဲ; Reduce Motion မှာ မပြ); (2) time-of-day aurora + Glow (`timeOfDayColors`); (3) contact tint (`colorsFor(otherId)` → glow + header ring); (4) live status: typing dots / recording voice… / choosing a photo… (`chats.activity.{uid}` {kind, at}, 20s fresh); (5) SVG iMessage tails + incoming avatar per run; (6) send↔mic spin morph, web tab bounce; (8) call minimize → floating pill (timer, mute, end); (9) photo blur-up (`thumb` ~24px in message) + shimmer skeleton; (10) "People you may know" (users by lastSeen, Say hi)
- [x] **Contact profile v2 (2026-11-18):** per-chat CHAT THEME ဖြုတ် (`chat-theme-picker.tsx` ဖျက်; `ChatAppearanceScope` နဲ့ saved prefs က ဆက်အလုပ်လုပ်); aurora + glass cards; quick actions ညှပ်နေတာ ပြင် (ScalePressable က style ကို အတွင်း view ပေါ်ချ → wrapper View flex:1); voice list ၃ ခု + "Show all"
- [x] **Profile hero v3 + bug fix (2026-11-18):** blurred-photo cover under transparent header (no photo → contact colors), gradient avatar ring + glow, presence pill; fix: unread divider/jump never showed (own markRead write zeroed unread before the chat snapshot) → unread count taken from chat list at open
- [x] **Countdown + Schedule + Voice→text (2026-11-19, uncommitted):** (4) countdowns — `chats.countdowns.{id}` {title, emoji, at, by}; chat ထိပ်မှာ bar, attach sheet → "Countdown", ရက်ရောက်ရင် confetti တစ်ခါ; (9) scheduled messages — Send ကို **ဖိထား** → sheet (in 1h / tonight / tomorrow / ၁၄ ရက်အတွင်း half-hour); message ကို createdAt = send time နဲ့ ချက်ချင်းရေး + `chats.scheduled.{msgId}` {at, senderId, preview}; တစ်ဖက်လူမှာ အချိန်မရောက်မချင်း ဖျောက်; `ChatsProvider` က ၁၅s တစ်ခါ due ဖြစ်တာကို transaction နဲ့ deliver (preview/unread/banner) — app တစ်ခုခု ဖွင့်ထားမှ; ကိုယ့် bubble မှာ dashed + "Scheduled · …", ဖိရင် Send Now / Copy / Cancel; chat list မှာ 🕓; **rules: message `validSchedule()` + scheduled delete → Publish လို**; (10) voice → text — `expo-speech-recognition` (**native, build အသစ်လို**), `lib/transcribe.ts` (file transcription, cache AsyncStorage), voice bubble မှာ **Aa** (နှိပ် = English, ဖိ = မြန်မာ), web မှာ မပြ
- [x] **Performance + web parity (2026-11-19, uncommitted):** iPhone ပူတာ — `PulseRing` infinite → ၃ ကြိမ်ပဲ (list ပေါ်က avatar တိုင်း GPU ဆက်တိုက်သုံး); chat message list ကို coarse clock (`listNow`, 30s) — အရင် 4s တိုင်း bubble အကုန် re-render; chat list tick 5s → 15s; read rows boxShadow ဖြုတ် (unread glow ပဲ); web tab bar → iOS 26 လို floating glass capsule; `arrow.down` web icon
- [x] **Double-check (2026-11-19):** `expo-speech-recognition` ကို `requireOptionalNativeModule` နဲ့ load (တိုက်ရိုက် import က module မပါတဲ့ build/Expo Go မှာ app စဖွင့်တာနဲ့ crash); countdown confetti session တစ်ခါပဲ (chat ဖွင့်တိုင်း မထပ်); chat list tick — typing ရှိရင် 3s / မရှိရင် 20s; Send Now ကျရှုံးရင် "already sent" info
- [x] **Live location + On this day (2026-11-19, uncommitted; rules ပြောင်းစရာမလို):** (1) attach → Location → "Send Current Location" / "Share Live for 15 min / 1 h / 8 h"; message `type: 'location'` + `liveUntil`, position က `chats.live.{uid}` (`lib/live-location.ts` watcher: ≥10s & ≥15m မှ write, foreground only — app ဖွင့်ထားမှ update; `ChatsProvider` က app ပြန်ဖွင့်ရင် resume / ပြီးရင် stop); live bubble (time left, updated ago, Stop), chat ထိပ်မှာ LiveBar → LiveMapSheet (၂ ယောက်လုံး pin, Directions); unsend ရင် share ရပ်; **real map** = OpenStreetMap tiles (`components/map-tiles.tsx`, API key မလို, static location bubble လည်း ပြောင်း); (2) "✨ N ago today" card (`lib/memories.ts`: 5y…1y, 6/3/1 month; photo ပါမှ ဒါမှမဟုတ် message ≥3; chat/day တစ်ခါ query + AsyncStorage cache; offline cache ကို "မရှိ" လို့ မမှတ်) → MemorySheet (photo grid ≤12 + viewer, conversation), ✕ = ဒီနေ့ ဖျောက်
- [x] **Double-check (live location / memories, 2026-11-19):** location bubble ကို ဖိရင် menu မပေါ်တာ (အထဲ Pressable က touch ယူ → `onLongPress` ဆင့်ပို့; unsend/forward/react ရပြီ); live bubble မှာ အချိန် pill ကို map ပေါ်ညာဘက်ထိပ် (Stop ခလုတ်နဲ့ မထပ်); `live` entry မပြည့်စုံရင် crash မဖြစ်အောင် guard
- [ ] **Build #4 (`d544879`)** — UI v3 / stories / enterprise / aurora / smart pass အားလုံးပါ; `expo-blur` native module အသစ်ကြောင့် build အသစ်လို → Actions Run workflow → Impactor နဲ့ ဖုန်း ၂ လုံး install
- [ ] **Build #3 (`adf0b48`)** — Actions မှာ Run workflow → Impactor နဲ့ ဖုန်း ၂ လုံး install → call / header / keyboard / hold-to-record / photo viewer / location စမ်းရန်
- [ ] **Firestore rules ကို ပြန် Publish ရန်** — `call`/`location` types + `stories`/`storyMedia` + story `reactions` (user က stories ကို publish ပြီး; reactions update ပြီးနောက် ထပ် publish လုပ်မလုပ် မသေချာ)
- [ ] Stream secret **rotate** (dashboard regenerate → `wrangler secret put STREAM_API_SECRET`)
- [ ] (optional) Web push: VAPID key → `webPushVapidKey`; `FIREBASE_SERVICE_ACCOUNT` secret; `npm run deploy:web`
- [ ] Workflow ထဲ actions v4 → Node 24 compatible version update (Node 20 deprecation warning)
- [ ] မလုပ်ရသေးတဲ့ feature: မြန်မာဘာသာ UI, Face ID app lock, long-press chat preview, group chat
- [ ] အနာဂတ် ($99 ဝယ်ရင်): EAS build, push (Expo), CallKit/VoIP ringing (`@stream-io/react-native-callingx` + `@react-native-firebase/*`), App Store/TestFlight

## 11. သိထားရမယ့် gotchas

- App ဖွင့်ရင် Firebase Auth က saved login ကို Google server နဲ့ reload စစ်တယ် (RN timeout **60s**) → mobile data နှေး/ပိတ်ရင် splash မှာ ရပ် → ၃s ကျော်ရင် `ConnectingScreen` ပြ (Mobile Data ခွင့်ပြုချက် / VPN hint)
- Firestore က RN မှာ default WebChannel နဲ့ "Could not reach backend" ဖြစ် → `experimentalForceLongPolling` (lib/firebase.ts)
- React Compiler lint: reanimated shared values ကို `.set()/.get()` သုံး; effect ထဲ sync setState မလုပ်
- Typed routes က `(tabs)/chats/index` ကို `/chats/index` လို့ ထုတ်တယ် → `'/chats' as Href` cast သုံး
- Stream SDK ကို top-level import လုပ်ရင် Expo Go crash → `calls-provider.native.tsx` က `require()` lazy
- `.web.tsx` / `.native.tsx` platform files သုံးထားတယ် (icon, phone-frame, web-header, push, calls)
- Windows: `gh` CLI မရှိ; Python ရှိ (multi-line patch တွေကို scratchpad ထဲ `.py` ရေးပြီး run); heredoc quoting သတိ
- Git: Windows LF→CRLF warning တွေ ပုံမှန်; commit message အဆုံးမှာ `Co-Authored-By` ထည့်
- `git push` / commit ကို user က ပြောမှ လုပ် (ဒီ project မှာ user က များသောအားဖြင့် "push" လို့ ပြောတယ်)
