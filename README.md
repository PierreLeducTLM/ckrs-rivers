This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

test
First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Mobile (Capacitor)

This project wraps the web app for iOS and Android via Capacitor. After making
web changes, build and sync the native projects before running on a device:

```bash
npm run build        # build the Next.js app
npm run cap:sync     # copy web assets + update native deps (iOS & Android)
npm run cap:android  # open the Android project in Android Studio
npm run cap:ios      # open the iOS project in Xcode
```

`cap:sync` runs `npx cap sync`, which both copies the web build into the native
projects and updates native plugin dependencies. Run it any time you change web
code, install a Capacitor plugin, or pull changes that touch native config.

## Play Store release

All listing materials (texts, icon, screenshots, changelog) live under
`fastlane/metadata/android/en-US/` in the fastlane-supply layout. Screenshots
and the hi-res icon are regenerated automatically — everything else is
hand-edited markdown/text.

```bash
npm run store:screenshots   # Playwright → production site on a Pixel 7 profile
npm run store:icon          # resizes public/logo.png to 512×512
npm run store:all           # both of the above
```

Screenshots are pulled from the live production URL
(`https://www.flowcast.ca/` by default; override with
`STORE_SITE_URL=…`). Pages captured are defined in `scripts/generate-store-screenshots.ts`.

### Release checklist

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. `npm run build && npm run cap:sync`
3. `npm run store:all` — regenerate icon + screenshots from production.
4. Edit `fastlane/metadata/android/en-US/changelogs/default.txt` with this
   release's notes.
5. Review `short_description.txt` / `full_description.txt` if features changed.
6. `npm run cap:android` — build a signed AAB in Android Studio.
7. Upload the AAB + listing assets to Play Console.

The feature graphic (`images/featureGraphic.png`, 1024×500) is still
hand-designed — see `images/featureGraphic.README.md` for the brief.

## App Store release (iOS)

iOS listing metadata lives under `fastlane/metadata/ios/` in the
[`fastlane deliver`](https://docs.fastlane.tools/actions/deliver/) layout,
with `en-US` and `fr-CA` locales mirroring the Android setup. Lanes are
defined in `fastlane/Fastfile`.

Prerequisites (must be supplied via environment / CI secrets — nothing
sensitive is committed):

- Apple Developer account + App Store Connect access
- An App Store Connect API key (`.p8`) — path via `APP_STORE_CONNECT_API_KEY_PATH`
- Apple ID / team IDs (see `fastlane/Appfile`)
- macOS host with Xcode (iOS builds can't run on Linux)

Install fastlane (one-time, on the macOS build machine):

```bash
gem install fastlane
```

Common lanes:

```bash
bundle exec fastlane ios metadata   # Upload listing + screenshots only (no binary)
bundle exec fastlane ios build      # Build a signed App Store IPA into ios/build/
bundle exec fastlane ios beta       # Build + push to TestFlight
bundle exec fastlane ios release    # Build + upload IPA & listing (does NOT submit for review)
```

### iOS release checklist

1. Bump `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION` in
   `ios/App/App.xcodeproj/project.pbxproj`.
2. `npm run build && npm run cap:sync`
3. Edit `fastlane/metadata/ios/en-US/release_notes.txt` (and `fr-CA`) with
   this release's notes.
4. Review other text fields if features changed.
5. Generate iPhone screenshots into `fastlane/screenshots/ios/<locale>/`
   (no committed script yet — see `fastlane/screenshots/ios/README.md`).
6. `bundle exec fastlane ios release` from the macOS build machine.
7. In App Store Connect, review the draft and submit for review manually
   (the lane stops short of submission on purpose).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
