# iChat — Setup Guide (အခမဲ့ လမ်းကြောင်း)

Firebase **Spark plan (အခမဲ့)** + **Cloudflare Workers (အခမဲ့)** + **Firebase Hosting (အခမဲ့)** ကိုပဲ သုံးပါတယ်။ ကတ်ချိတ်စရာ မလိုပါဘူး။

| Feature | ဘယ်အဆင့်ပြီးရင် ရလဲ |
|---|---|
| Chat၊ Block/Report၊ Edit၊ Reactions၊ Forgot password | 1 |
| 📷 ပုံ၊ 🎤 Voice message၊ Profile photo (Firestore ထဲ သိမ်းတယ်) | 1 |
| 🌐 iPhone Home Screen app (PWA) | 2 |
| 🔔 Push notification | 2 + 3 |
| 📞 Voice call | Apple $99 + dev build လိုတယ် (အောက်ဆုံးမှာ ကြည့်ပါ) |

---

## 1. Firestore rules ကို Publish လုပ်ပါ (၁ မိနစ်)

https://console.firebase.google.com/project/ichat-2a37f/firestore/rules

[firestore.rules](firestore.rules) ထဲက စာကို paste လုပ်ပြီး **Publish** နှိပ်ပါ။

## 2. Web app ကို Firebase Hosting ပေါ် တင်ပါ

```bash
npm install -g firebase-tools
firebase login
cd e:\Depolyment\ios\ichat
npm run deploy:web
```

ပြီးရင် **https://ichat-2a37f.web.app** မှာ app ကို သုံးလို့ရပါပြီ။

**iPhone မှာ install လုပ်နည်း:**
1. iPhone **Safari** မှာ `https://ichat-2a37f.web.app` ကို ဖွင့်ပါ။
2. အောက်ခြေက **Share** ခလုတ် (□↑) ကို နှိပ်ပါ → **Add to Home Screen** → **Add** နှိပ်ပါ။
3. Home Screen က **iChat** icon ကနေ ဖွင့်ပါ။ App တစ်ခုလို full screen ပွင့်ပါမယ်။

> Code ပြင်ပြီးတိုင်း `npm run deploy:web` ကို ပြန် run ပါ။ ၃ ယောက်လုံး app ကို ပိတ်ပြီး ပြန်ဖွင့်ရင် version အသစ် ရပါမယ်။

## 3. Push notification (Cloudflare Worker)

### 3a. Firebase ဘက်က key ၂ ခု ယူပါ
1. **Web Push key (VAPID):**
   https://console.firebase.google.com/project/ichat-2a37f/settings/cloudmessaging
   → **Web configuration → Web Push certificates → Generate key pair** နှိပ်ပါ → ပေါ်လာတဲ့ **Key pair** ကို copy ကူးပါ။
   → [app.json](app.json) ထဲက `expo.extra.webPushVapidKey` မှာ paste လုပ်ပါ (public key ဖြစ်လို့ ထည့်လို့ရပါတယ်)။
2. **Service account key:**
   https://console.firebase.google.com/project/ichat-2a37f/settings/serviceaccounts/adminsdk
   → **Generate new private key** နှိပ်ပါ → `.json` ဖိုင် download ဖြစ်လာပါမယ်။
   ⚠️ ဒီဖိုင်က **လျှို့ဝှက်ချက်** ပါ။ Git ထဲ မထည့်ပါနဲ့၊ ဘယ်သူ့ကိုမှ မပို့ပါနဲ့။

### 3b. Cloudflare Worker deploy လုပ်ပါ
1. https://dash.cloudflare.com/sign-up မှာ account ဖွင့်ပါ (အခမဲ့၊ ကတ်မလိုပါ)။
2. Terminal မှာ:
   ```bash
   cd e:\Depolyment\ios\ichat\worker
   npx wrangler login
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   ```
   Value ထည့်ခိုင်းရင် download လုပ်ထားတဲ့ `.json` ဖိုင်ထဲက စာ **အကုန်** ကို paste လုပ်ပြီး Enter နှိပ်ပါ။
   ```bash
   npx wrangler deploy
   ```
3. Deploy ပြီးရင် `https://ichat-push.<your-name>.workers.dev` လို URL တစ်ခု ပေါ်လာပါမယ်။ အဲဒါကို [app.json](app.json) ထဲက `expo.extra.pushWorkerUrl` မှာ ထည့်ပါ။
4. `.json` key ဖိုင်ကို ကွန်ပျူတာထဲကနေ **ဖျက်ပစ်ပါ** (Worker ထဲမှာ သိမ်းပြီးသားမို့ မလိုတော့ပါဘူး)။
5. Web app ကို ပြန်တင်ပါ:
   ```bash
   cd e:\Depolyment\ios\ichat
   npm run deploy:web
   ```

### 3c. iPhone မှာ notification ဖွင့်ပါ
Home Screen က iChat ကို ဖွင့်ပါ → **Settings → Message Notifications** ကို နှိပ်ပါ → **Allow** နှိပ်ပါ။
(iOS 16.4 နဲ့ အထက် လိုပါတယ်။ Safari tab ထဲကနေ မရပါဘူး၊ Home Screen app ကနေပဲ ရပါတယ်။)

---

## ကုန်ကျစရိတ် (လူ ၃ ယောက်)

| Service | အခမဲ့ quota | သုံးမယ့်ပမာဏ |
|---|---|---|
| Firestore | တစ်ရက် read 50K / write 20K၊ 1 GB | ~20% |
| Firebase Hosting | 10 GB storage၊ တစ်ရက် 360 MB | အနည်းငယ် |
| Cloudflare Workers | တစ်ရက် request 100,000 | တစ်ရက် ~300 |
| **စုစုပေါင်း** | | **$0** |

ပုံ / voice တွေကို Firestore ထဲ သိမ်းထားတာမို့ တစ်ခုချင်းစီ ~650 KB အောက် ဖြစ်အောင် app က အလိုအလျောက် ချုံ့ပေးပါတယ်။ Voice message ကို ၆၀ စက္ကန့်အထိ ပို့လို့ရပါတယ်။

---

## iPhone app အစစ် — Sideloadly + free Apple ID ($0)

Mac နဲ့ Apple $99 မလိုပါဘူး။ ဒါပေမဲ့ ကန့်သတ်ချက်တွေ ရှိပါတယ်:
- ⚠️ **၇ ရက်တစ်ခါ** ပြန် install (refresh) လုပ်ရပါမယ်။ မလုပ်ရင် app ပွင့်မရတော့ပါဘူး (data မပျောက်ပါဘူး)။
- ⚠️ Push notification **မရပါဘူး** (free Apple ID မှာ ခွင့်မပြုလို့ပါ)။ App ဖွင့်ထားချိန်မှာတော့ စာ realtime ရောက်ပါတယ်။
- Free Apple ID တစ်ခုနဲ့ iPhone တစ်လုံးမှာ sideload app **၃ ခုအထိ** ပဲ ထည့်လို့ရပါတယ်။

### A. `.ipa` ကို GitHub မှာ build ထုတ်ပါ (Mac မလို)
1. Code ကို GitHub ပေါ် push လုပ်ထားပါ။
2. https://github.com/tunlin46213/ichat/actions → ဘယ်ဘက်က **iOS sideload build** → **Run workflow** → **Run workflow** နှိပ်ပါ။
3. ~၂၀–၃၀ မိနစ် စောင့်ပါ။ ✅ အစိမ်းရောင် ဖြစ်ရင် run ကို နှိပ်ပါ → အောက်ဆုံး **Artifacts → iChat-ipa** ကို download လုပ်ပါ → zip ကို ဖြည်ပါ → **`iChat.ipa`** ရပါမယ်။
   - Repo က **public** ဆိုရင် အခမဲ့ အကန့်အသတ်မရှိ build ထုတ်လို့ရပါတယ်။ **Private** ဆိုရင် တစ်လ macOS ~200 မိနစ် (build ~၆–၈ ကြိမ်) အခမဲ့ ရပါတယ်။
   - ❌ အနီရောင် ဖြစ်ရင် error log ကို ကျွန်တော့်ကို ပို့ပေးပါ။

### B. ကွန်ပျူတာမှာ program ထည့်ပါ (တစ်ကြိမ်ပဲ)
1. **iTunes** နဲ့ **iCloud** ကို Apple website ကနေ download လုပ်ပြီး ထည့်ပါ။ (**Microsoft Store version မဟုတ်တာ** ဖြစ်ရပါမယ်။ Sideloadly က Apple website version ကိုပဲ သုံးလို့ရပါတယ်)
   - https://www.apple.com/itunes/download/win64
   - https://support.apple.com/en-us/103232 (iCloud for Windows)
2. **Sideloadly**: https://sideloadly.io → download လုပ်ပြီး install လုပ်ပါ။

### C. iPhone ထဲ install လုပ်ပါ
1. iPhone ကို USB ကြိုးနဲ့ ကွန်ပျူတာမှာ ချိတ်ပါ → iPhone မှာ **Trust This Computer** ပေါ်ရင် **Trust** နှိပ်ပါ။
2. Sideloadly ကို ဖွင့်ပါ → `iChat.ipa` ကို ဆွဲထည့်ပါ → **Apple ID** (email) ထည့်ပါ → **Start** နှိပ်ပါ → Apple ID password ထည့်ပါ။
   - ⚠️ အဓိက Apple ID အစား **app သွင်းဖို့ သီးသန့် Apple ID အသစ်** တစ်ခု ဖွင့်သုံးတာ ပိုလုံခြုံပါတယ်။
3. iPhone မှာ:
   - **Settings → General → VPN & Device Management** → ကိုယ့် Apple ID ကို နှိပ်ပါ → **Trust** နှိပ်ပါ။
   - **Settings → Privacy & Security → Developer Mode → On** → iPhone restart ဖြစ်ပါမယ် → **Turn On** နှိပ်ပါ။
4. Home Screen က **iChat** ကို ဖွင့်ပါ 🎉

iPhone ၃ လုံးလုံးကို ဒီအဆင့် C အတိုင်း တစ်လုံးချင်း လုပ်ပါ။

### D. ၇ ရက်တစ်ခါ refresh လုပ်ပါ
- Sideloadly က **Automatic refresh** ကို ဖွင့်ထားပြီး iPhone နဲ့ ကွန်ပျူတာ **WiFi တစ်ခုတည်း** မှာ ရှိရင် အလိုအလျောက် refresh လုပ်ပေးပါတယ်။
- မဟုတ်ရင် ၇ ရက်မပြည့်ခင် iPhone ကို ပြန်ချိတ်ပြီး အဆင့် C.2 ကို ပြန်လုပ်ပါ။
- Code အသစ် ပြင်ပြီးရင် အဆင့် A ကနေ build ပြန်ထုတ်ပြီး install ပြန်လုပ်ပါ။

---

## (နောက်မှ) Native iPhone app + Voice call — Apple $99

Voice call နဲ့ App Store မှာ တင်ချင်တဲ့အခါ ဒီအဆင့်တွေ လုပ်ပါ:
1. Apple Developer Program ($99/နှစ်) ကို ဝယ်ပါ။
2. Stream account ဖွင့်ပြီး API Key ကို `expo.extra.streamApiKey` မှာ ထည့်ပါ → `npx wrangler secret put STREAM_API_SECRET` နဲ့ secret ထည့်ပြီး `npx wrangler deploy` လုပ်ပါ။
3. ```bash
   npm install -g eas-cli
   eas login
   eas init
   eas device:create
   eas build --profile development --platform ios
   ```
4. Native app မှာ push notification က Expo push နဲ့ အလိုအလျောက် အလုပ်လုပ်ပါမယ်။ အဲဒါကိုလည်း Worker ကပဲ ပို့ပေးပါတယ်။
