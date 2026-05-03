# FlowCast — Release Checklist

Everything that still has to happen outside this repo before `com.flowcast.paddle.app` can ship to the Google Play Store and Apple App Store. In-repo code is already wired (see commit `b1ebd40`). This file is the punch list of manual steps.

- **App name:** FlowCast
- **Bundle / package ID (both stores):** `com.flowcast.paddle.app`
- **Old package (being retired):** `com.ckrsrivers.app`

---

## 1. Shared assets you'll need

Prepare these once, reuse for both stores.

### 1.1 Store listing text (EN + FR)

Existing Play Store metadata lives in `android/fastlane/metadata/android/{en-US,fr-CA}/`. Review and update before upload — it was written for the old CKRS branding:

- `title.txt` — max 30 chars. Currently "CKRS Rivers" → change to **FlowCast**.
- `short_description.txt` — max 80 chars, Play Store only.
- `full_description.txt` — max 4,000 chars, Play Store only.
- `changelogs/default.txt` — max 500 chars, what's-new for each `versionCode`.

Apple equivalents (same intent, different fields/limits — enter directly in App Store Connect):

- **Name** — max 30 chars.
- **Subtitle** — max 30 chars.
- **Promotional text** — max 170 chars (editable without new build).
- **Description** — max 4,000 chars.
- **Keywords** — max 100 chars, comma-separated, no spaces after commas.
- **What's New** — max 4,000 chars, per-version release notes.
- **Support URL**, **Marketing URL**, **Privacy Policy URL** (URL is required — you need a public privacy policy page).

### 1.2 Screenshots

| Purpose | Required size | Count | Current status |
|---|---|---|---|
| **Play Store** phone | min 320 px on short side, 16:9 or 9:16 | 2–8 | 4 PNGs present in `android/fastlane/metadata/android/{en-US,fr-CA}/images/phoneScreenshots/` — **re-shoot with new branding** |
| **Play Store** feature graphic | 1024×500 JPG/PNG | 1 | Missing — only `featureGraphic.README.md` placeholder |
| **Play Store** app icon | 512×512 PNG, 32-bit | 1 | `icon.png` present per locale |
| **App Store** 6.9" iPhone (required) | 1320×2868 or 2868×1320 | 2–10 | Missing |
| **App Store** 6.5" iPhone (optional but recommended) | 1284×2778 or 1242×2688 | 2–10 | Missing |
| **App Store** 5.5" iPhone (legacy, optional) | 1242×2208 | 2–10 | Missing |
| **App Store** 13" iPad (required if app runs on iPad) | 2048×2732 | 2–10 | Missing |

Tip: capture them on real devices/simulators running a clean build with mock data, then run through a framer (e.g. fastlane `frameit`, Screenshot Studio, or Figma) for marketing polish.

### 1.3 Marketing metadata

- **Primary category:** Sports (or Travel). Secondary optional.
- **Content rating:** run the IARC questionnaire (Play) and Apple's rating questionnaire (App Store). Answer honestly re: user-generated content, location, etc.
- **Privacy policy URL** — required by both stores. Must cover: location data (if used), device tokens for push, Firebase/Analytics, any personal data (email, account info).
- **Data safety form (Play Store):** declare what data is collected, shared, encrypted in transit, user-deletable. Maps to GDPR/CCPA.
- **App Privacy (App Store Connect):** similar questionnaire, per data type. Must match your privacy policy.

---

## 2. Android — Google Play Store

### 2.1 Create the Play Console listing

1. Play Console → **Create app** → name "FlowCast", default language, app/game = App, free/paid.
2. Accept declarations. Complete **Main store listing**, **Store settings**, **App content** (privacy policy, ads, app access, content rating, target audience, news/gov declarations, data safety, government apps).
3. Under **Policy → App content** you cannot promote to any track until all green checks are in place.

### 2.2 Firebase config

The old `google-services.json` was disabled (`android/app/google-services.json.old-ckrsrivers`). Without the replacement file, FCM / push will silently not work.

1. Firebase Console → your project → Project Settings → **Add app** → Android.
2. Package name: `com.flowcast.paddle.app`. Nickname: FlowCast Android.
3. Download `google-services.json`, drop at `android/app/google-services.json`.
4. Add the **SHA-1 of your upload keystore** in Firebase if you use Auth or dynamic links:
   ```
   keytool -list -v -keystore android/app/ckrs-rivers-release.keystore -alias <your-alias>
   ```
5. Delete the `.old-ckrsrivers` backup once the new file is confirmed working.

### 2.3 Play Console API access (for Fastlane)

1. Google Cloud Console → IAM & Admin → Service Accounts → **Create** (e.g. `fastlane-flowcast@<project>.iam.gserviceaccount.com`).
2. Grant role **Service Account User**. Create a JSON key → download.
3. Play Console → **Setup → API access** → Link the Cloud project → grant the service account **Release Manager** (or at minimum: Releases + Store listing + App access).
4. Save the JSON at `android/fastlane/play-store-key.json` (gitignored).
5. Test: `cd android && bundle exec fastlane run validate_play_store_json_key`.

### 2.4 Local toolchain

System Ruby 2.6 is too old for current Fastlane.

```bash
brew install rbenv ruby-build
rbenv init                       # follow shell-init, restart terminal
rbenv install 3.3.5
cd <repo root>
rbenv local 3.3.5                # writes .ruby-version
bundle install                   # installs fastlane to vendor/bundle
```

From now on, always prefix Fastlane commands with `bundle exec`.

### 2.5 Keystore

`android/app/ckrs-rivers-release.keystore` still works for `com.flowcast.paddle.app` — Play only needs the upload key to be consistent across uploads of a single app. If you rename the file for branding, update `android/app/keystore.properties`.

**⚠️ Back up the keystore and its password NOW.** Losing them = you can never update the app.

### 2.6 First upload

1. In Play Console, manually create a release on the **Internal testing** track (you cannot let Fastlane create the app, only upload to an existing one).
2. Fill all forms until Play shows the "Ready to publish" green check.
3. From project:
   ```bash
   npm run build
   npx cap sync android
   cd android
   bundle exec fastlane android internal
   ```
   This builds `app-release.aab` and uploads as a **draft** internal release.
4. Review in Play Console → **Publish**. Add yourself as a tester, accept the invite on a real device, verify push works.
5. Promote to **Closed testing → Open testing → Production** over successive releases.

### 2.7 Remove the old app

Once FlowCast is live and you've announced it, in Play Console → open the old `com.ckrsrivers.app` listing → **Advanced settings → App availability → Unpublish**. Keep the listing (you can't delete it; unpublishing is the max) and consider a final update with a "we moved to FlowCast" screenshot + deeplink pointing at the new listing.

---

## 3. iOS — Apple App Store

### 3.1 Apple Developer account prerequisites

1. Paid Apple Developer Program membership ($99/yr).
2. **Certificates, Identifiers & Profiles** → Identifiers → **+** → App IDs → App.
   - Bundle ID: `com.flowcast.paddle.app` (explicit, not wildcard).
   - Capabilities: tick **Push Notifications**, **Associated Domains** (if you want universal links later).
3. Regenerate or create provisioning profiles for Development + App Store distribution.

### 3.2 APNs auth key (for Firebase Cloud Messaging to iOS)

1. Developer portal → **Keys** → **+** → name "FlowCast APNs" → tick **Apple Push Notifications service (APNs)**.
2. Download the `.p8` file (you can only download it **once** — back it up alongside the keystore).
3. Note the **Key ID** and your **Team ID**.
4. Firebase Console → Project Settings → **Cloud Messaging** tab → Apple app configuration → Upload the `.p8`, enter Key ID + Team ID.

### 3.3 Firebase iOS config

1. Firebase Console → Add app → **iOS**. Bundle ID `com.flowcast.paddle.app`.
2. Download `GoogleService-Info.plist`.
3. Drop it at `ios/App/App/GoogleService-Info.plist` (next to `Info.plist`).
4. Open `ios/App/App.xcworkspace` in Xcode → right-click the `App` group → **Add Files to "App"…** → pick `GoogleService-Info.plist`, tick the `App` target. Must be inside the app bundle, not just on disk.

### 3.4 Xcode capability sanity check

1. Open `ios/App/App.xcworkspace`.
2. Select the `App` target → **Signing & Capabilities**.
3. Verify the following are listed (they should be — they're already in `App.entitlements` and `Info.plist`):
   - ✅ **Push Notifications**
   - ✅ **Background Modes → Remote notifications**
4. If Push Notifications is missing, click **+ Capability → Push Notifications**. Xcode will recognize the existing `App.entitlements` file.
5. Under **Signing**: pick your team, leave automatic signing on unless you manage profiles manually.

### 3.5 App Store Connect listing

1. App Store Connect → **My Apps → +** → New App → platform iOS, name "FlowCast", primary language, bundle ID `com.flowcast.paddle.app`, SKU `flowcast-ios`.
2. Fill **App Information** (category, content rights, age rating questionnaire).
3. Fill **Pricing and Availability**.
4. Fill **App Privacy** (data collection questionnaire).
5. Under the iOS app version (1.0.0), fill:
   - Screenshots per device class (see §1.2)
   - Promotional text, description, keywords, support URL, marketing URL
   - What's New
   - App Review Information (contact, demo account if login is required, notes)
   - Version release: auto or manual

### 3.6 Build, archive, upload

Fastlane lanes are configured at `ios/fastlane/` (mirroring the Android setup). See `ios/fastlane/README.md` for full details.

**One-time prerequisites:**

1. **App Store Connect API key** (preferred over Apple ID + 2FA — works headlessly):
   - App Store Connect → Users and Access → **Integrations → App Store Connect API → Keys** → **+** → role **App Manager**.
   - Download `AuthKey_<KEY_ID>.p8` (single download — back it up next to the keystore and APNs `.p8`).
   - Drop the `.p8` at `ios/fastlane/AuthKey_<KEY_ID>.p8` (gitignored). The `before_all` hook auto-discovers any `AuthKey_*.p8` in that directory.
   - Note the **Key ID** (10 chars, in the filename) and **Issuer ID** (UUID at the top of the Keys page).
2. **Env file:** `cp ios/fastlane/.env.default.example ios/fastlane/.env.default` and fill in `FASTLANE_ASC_KEY_ID`, `FASTLANE_ASC_ISSUER_ID`, and `FASTLANE_TEAM_ID` (the 10-char team ID from developer.apple.com → Membership).
3. **Toolchain:**
   - **Ruby 3.3+** via rbenv (system Ruby 2.6 is too old). `rbenv install 3.3.11 && rbenv local 3.3.11`.
   - **`bundle install`** from the repo root (installs fastlane and CocoaPods 1.16+ into `vendor/bundle`). The Gemfile pins `cocoapods` so it runs under the same Ruby as fastlane — without this, Homebrew's `pod` (which uses a different Ruby ABI) breaks `bundle exec pod install`.
   - **Xcode 26 or later.** Apple now rejects uploads built against any older SDK (`SDK version issue. iOS 26 SDK or later required.`). After installing, run `sudo xcode-select -s /Applications/Xcode.app`.
4. **Apple Developer Portal + App Store Connect:**
   - App ID `com.flowcast.paddle.app` registered with Push Notifications capability (developer.apple.com → Identifiers).
   - App Store Connect listing created (My Apps → +). Listing must exist before fastlane can upload.

**Ship to TestFlight:**

```bash
cd ios
bundle exec fastlane ios beta
```

Runs `npm run build:mobile` (skips DB migration — that's a server-deploy concern), `npx cap sync ios`, `pod install`, bumps `CFBundleVersion` to the next available number, then provisions a Distribution cert + App Store profile via the ASC API key (`cert` + `sigh`), switches the App target's Release config to manual signing with that profile, archives, and uploads to TestFlight as a draft. Internal testers can install ~5–15 min after Apple finishes processing.

The manual-signing route is necessary because automatic signing during archive insists on a Development profile, which requires a registered device. The cert + sigh + manual-signing path provisions everything via the ASC API key with no device registration needed.

**Submit to the App Store:**

```bash
cd ios
bundle exec fastlane ios release
```

Uploads as a draft to App Store Connect — review in the dashboard and submit for review manually for the first release.

**Other lanes:** `validate` (build + precheck, no upload), `metadata` (listing text/screenshots only), `build` (just produce `ios/build/App.ipa`).

**Escape hatch:** if anything in the fastlane setup fights you, you can still archive from Xcode directly — `open ios/App/App.xcworkspace` → Product → Archive → Distribute → App Store Connect → Upload.

### 3.7 TestFlight before production

1. Add internal testers (team members, up to 100) — no review needed, instant install.
2. Optionally submit for **External TestFlight** review (max 10k testers, ~24h review).
3. Verify push notifications on a real device (simulator cannot receive APNs tokens, though `xcrun simctl push` works for delivery once you fake a token).

### 3.8 Submit for App Store review

1. In App Store Connect version page, attach the TestFlight build.
2. Submit for review. Typical turnaround: 24–48h.
3. Common rejection causes to pre-empt:
   - **Metadata rejection** — missing privacy policy URL, unclear demo account, screenshot shows unreleased features.
   - **Guideline 5.1.1 (Data Collection)** — push registration must explain why, and the pre-permission prompt copy matters.
   - **Guideline 4.0 (Design)** — if iPad screenshots are supplied but app doesn't work correctly on iPad, ship iPhone-only (tick "iPhone only" in App Store Connect).

---

## 4. Pre-flight checklist (before tagging v1.0.0)

### Android

- [ ] New `google-services.json` for `com.flowcast.paddle.app` in place
- [ ] Ruby 3.3+ and `bundle install` successful
- [ ] `play-store-key.json` downloaded and placed under `android/fastlane/`
- [ ] Play Console app created, all forms green
- [ ] Store listing text reviewed/translated
- [ ] 4+ localized screenshots + 1024×500 feature graphic
- [ ] Keystore + password backed up off-device
- [ ] `bundle exec fastlane android internal` uploads cleanly
- [ ] Push notification received on test device

### iOS

- [ ] **Xcode 26 or later** installed (Apple rejects uploads built with older SDKs)
- [ ] App ID `com.flowcast.paddle.app` created with Push Notifications capability
- [ ] APNs `.p8` key uploaded to Firebase
- [ ] `GoogleService-Info.plist` added to Xcode target
- [ ] Xcode shows Push Notifications + Background Modes under Signing & Capabilities
- [ ] App Store Connect app created, App Privacy form complete
- [ ] App Store Connect API key `.p8` placed at `ios/fastlane/AuthKey_<KEY_ID>.p8`
- [ ] `ios/fastlane/.env.default` filled in (KEY_ID, ISSUER_ID, TEAM_ID)
- [ ] Ruby 3.3+ via rbenv and `bundle install` successful
- [ ] Screenshots for each required device class
- [ ] Privacy policy URL live and reachable
- [ ] `bundle exec fastlane ios beta` uploads cleanly
- [ ] First TestFlight build validated on real device
- [ ] Push notification received on test device

### Both

- [ ] `versionCode` / `CFBundleVersion` bumped consistently
- [ ] Release notes written in EN + FR
- [ ] Privacy policy published and linked
- [ ] Support email/URL reachable
