# App Store Listing — iOS

App Store Connect listing assets in the [`fastlane deliver`](https://docs.fastlane.tools/actions/deliver/)
metadata layout. Mirrors the Android setup under
`fastlane/metadata/android/` so the same release workflow applies to both
platforms.

## Layout

```
fastlane/metadata/ios/
├── copyright.txt                 # Global — shared across locales
├── primary_category.txt          # Apple category key (e.g. SPORTS)
├── secondary_category.txt        # Apple category key (e.g. WEATHER)
├── en-US/
│   ├── name.txt                  # ≤30 chars
│   ├── subtitle.txt              # ≤30 chars
│   ├── description.txt           # ≤4000 chars
│   ├── keywords.txt              # ≤100 chars, comma-separated
│   ├── promotional_text.txt      # ≤170 chars
│   ├── release_notes.txt         # ≤4000 chars, every release
│   ├── support_url.txt
│   ├── marketing_url.txt
│   └── privacy_url.txt
└── fr-CA/                        # Same files as en-US
```

Screenshots live at `fastlane/screenshots/ios/<locale>/` once generated
(not yet wired into an `npm run` script — see README.md "iOS" section).

## Updating for a release

Edit `release_notes.txt` (per locale), bump marketing/project version in
`ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION` /
`CURRENT_PROJECT_VERSION`), then run `bundle exec fastlane ios metadata`
to push listing changes — or `bundle exec fastlane ios release` to upload
a new IPA alongside the metadata.
