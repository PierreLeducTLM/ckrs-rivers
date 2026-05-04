---
name: release-mobile
description: Bump version and publish iOS + Android as App Store / Play production drafts
---

# Mobile Release

Ship a new version of FlowCast to the iOS App Store (draft) and Google Play (production track, draft). Suggest the next version from commits since the last bump, confirm with the user, then run the full pipeline.

## What this command does

1. Reads the current version from `android/app/build.gradle`.
2. Finds commits since the last version bump and **suggests** a semver bump (major/minor/patch) based on commit messages. **Asks the user to confirm or override** before any changes.
3. **Drafts the "What's New" release notes in French** from the same commit list, asks the user to review/edit, then writes them to disk:
   - `ios/fastlane/metadata/fr-CA/release_notes.txt` (App Store, fr-CA only — that's all that's configured)
   - `android/fastlane/metadata/android/fr-CA/changelogs/<newVersionCode>.txt` (Play, French)
   - `android/fastlane/metadata/android/en-US/changelogs/<newVersionCode>.txt` (Play, English — short translation of the same content)
4. Bumps versions in 4 places:
   - `android/app/build.gradle` — `versionCode` (+1) and `versionName`
   - `ios/App/App.xcodeproj/project.pbxproj` — both `MARKETING_VERSION` lines
   - `ios/App/App/Info.plist` — `CFBundleShortVersionString` (via `xcrun agvtool` from `ios/App`)
5. Runs `npm install` to ensure node_modules matches `package-lock.json` (a missing dep silently fails the iOS lane during `next build`).
6. Runs the iOS release lane (`cd ios && bundle exec fastlane release`) — this lane internally does `next build` + `cap sync ios` + `cocoapods` + `bump_build` (TestFlight latest+1) + signed Release IPA + upload as App Store Connect draft. **Note:** the current `release` lane has `skip_metadata: true`, so release notes don't ship via this lane. After it succeeds, run `cd ios && bundle exec fastlane metadata` to push the `release_notes.txt` to App Store Connect.
7. Runs `npm run build:mobile && npx cap sync android`, then the Android production lane (`cd android && bundle exec fastlane production`) — builds signed AAB and uploads to Play production track as draft. Changelogs are picked up automatically from `metadata/android/<locale>/changelogs/<versionCode>.txt`.
8. Commits version-bump + release-notes files with a clear message; leaves any unrelated working-tree changes alone.

Both fastlane lanes upload as **drafts** — nothing auto-submits for review or rolls out to users.

## Step-by-step

### 1. Suggest a version bump

Run these in parallel:

```bash
grep -E "versionName|versionCode" android/app/build.gradle
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | sort -u
git log --oneline --no-merges $(git log --diff-filter=M --format=%H -1 -- android/app/build.gradle)..HEAD
```

The third command lists commits since `android/app/build.gradle` was last touched (which is when versions were last bumped). Read the commit messages and suggest:

- **major** (`X.0.0`) — breaking changes, removed features, big rebrands
- **minor** (`X.Y.0`) — new features (`Add …`, `feat:`, new screens, new capabilities)
- **patch** (`X.Y.Z`) — bug fixes only (`Fix …`, `fix:`, hotfix-style messages)

Show the user:
- Current version + last bump date
- 5–10 most recent commits
- Suggested next version + which bump type + 1-line rationale

Then ask: "Confirm bump to `X.Y.Z`? (y/N or override e.g. `1.2.0`)". **Do not proceed without an explicit answer.**

### 2. Draft the "What's New" release notes (in French)

From the same commit list, draft user-facing release notes **in French** (Québécois — this is a whitewater app for Canadian paddlers). Tone: clear, friendly, non-technical. Audience: kayakers and rafters, not developers.

**Editorial rules:**
- Translate technical commit messages into outcome-oriented user benefits. "Add river sharing with OG previews" → « Partagez vos rivières avec aperçus enrichis ».
- Skip dev-only commits (test scripts, build tooling, dependency bumps, internal refactors) — they're invisible to users.
- **Do not mention bug fixes.** The user does not want fix-style commits in the release notes — only new features and improvements. If a commit is purely a fix (`Fix …`, `fix:`, regression patches), exclude it. If the version is *only* fixes, surface that to the user before drafting and ask how to frame it.
- Skip removals unless they're a deliberate user-facing feature change. If you do mention a removal, frame it neutrally.
- Use bullets, one feature per line, max 5–6 bullets.
- Vocabulary: « mise à l'eau » / « sortie » for put-in / take-out. « Notifications » or « alertes ». Say « rivière » not « cours d'eau ».
- Don't invent features that aren't in the commits.

**Length budgets (hard limits):**
- App Store: 4000 chars — you can be more generous, slightly warmer tone.
- Play Store: **500 chars** — the French version must fit. Trim if needed.
- The English Play version is a faithful translation of the French Play version.

**Show the drafts to the user** in the chat (don't write to files yet) and ask: "Approve these notes, or edit?". Accept either confirmation or revisions. **Iterate** until the user approves — do not write to disk on the first draft unless explicitly told to.

Once approved, write to:
- `ios/fastlane/metadata/fr-CA/release_notes.txt` (overwrite)
- `android/fastlane/metadata/android/fr-CA/changelogs/<newVersionCode>.txt` (new file, named after the bumped versionCode)
- `android/fastlane/metadata/android/en-US/changelogs/<newVersionCode>.txt` (new file, English translation)

### 3. Bump the versions

Once the user confirms version `X.Y.Z`:

```bash
# Android: versionCode = previous + 1, versionName = X.Y.Z
# Edit android/app/build.gradle — change both `versionCode N` and `versionName "..."` lines
```

```bash
# iOS marketing version (both Debug + Release configs in pbxproj)
# Edit ios/App/App.xcodeproj/project.pbxproj — replace BOTH `MARKETING_VERSION = OLD;` lines with `MARKETING_VERSION = X.Y.Z;`
# (The Edit tool with replace_all=true works.)
```

```bash
# iOS Info.plist CFBundleShortVersionString — agvtool handles this cleanly.
# Note: if Info.plist already references $(MARKETING_VERSION), agvtool may inline the string; that's fine.
cd ios/App && xcrun agvtool new-marketing-version X.Y.Z
```

iOS `CFBundleVersion` (build number) is auto-bumped by the fastlane `bump_build` lane to `latest_testflight_build_number + 1` — **do not** bump it manually.

### 4. Sync deps

```bash
npm install
```

`@capacitor/share` and similar can be in `package-lock.json` but missing from `node_modules`, which silently fails `next build` inside the iOS lane.

### 5. Run the iOS release lane (binary) + metadata lane (release notes)

Fastlane needs the rbenv shims in PATH (system Ruby is too old for the project's bundler):

```bash
export PATH="$HOME/.rbenv/shims:$PATH"
cd ios && bundle exec fastlane release > /tmp/fastlane-ios.log 2>&1 &
echo "PID=$!"
```

**Run in background** (it takes 2–5 min). Watch with a Monitor on the PID:

```bash
while kill -0 <PID> 2>/dev/null; do sleep 10; tail -3 /tmp/fastlane-ios.log | grep -E "Successfully|Error|error:|FAIL|user_error|aborted|⚠|build_app|cocoapods|cap sync|upload_to_app_store|✗" --line-buffered; done
echo "===EXITED==="; tail -30 /tmp/fastlane-ios.log
```

**Do not pipe `bundle exec fastlane` through `tee`** — the pipe masks fastlane's exit code so a failed build looks like exit 0. Use file redirect instead.

If the lane fails, `tail -100 /tmp/fastlane-ios.log` and surface the actual error. Common failures:
- Module not found in `next build` → `npm install` was incomplete; install and retry.
- `aps-environment` is "development" → see `ios/fastlane/Fastfile` `:build` lane error message; needs to be "production" in `ios/App/App/App.entitlements`.
- `FASTLANE_TEAM_ID is not set` → check `ios/fastlane/.env.default` (do not read this file unless permitted; just report the missing var).

**After the release lane succeeds**, push the release notes to App Store Connect (the `release` lane has `skip_metadata: true`, so this is a separate call):

```bash
export PATH="$HOME/.rbenv/shims:$PATH"
cd ios && bundle exec fastlane metadata > /tmp/fastlane-ios-metadata.log 2>&1
echo "EXIT=$?"
tail -30 /tmp/fastlane-ios-metadata.log
```

The `metadata` lane is fast (no build, just upload) — uploads `release_notes.txt` and other locale metadata. If you want to skip it (e.g. notes haven't changed), say so and don't call it.

### 6. Run the Android production lane

JDK 25 (Homebrew default) breaks Gradle 8.14.3 with `Unsupported class file major version 69`. Use JDK 17:

```bash
export PATH="$HOME/.rbenv/shims:$PATH"
export JAVA_HOME="/Users/pierreleduc/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:mobile && npx cap sync android
cd android && bundle exec fastlane production > /tmp/fastlane-android.log 2>&1
echo "EXIT=$?"
tail -40 /tmp/fastlane-android.log
```

If JDK 17 is at a different path, fall back to `/usr/libexec/java_home -v 17` to find it.

### 7. Commit version-bump + release-notes files

```bash
git status --short
git add android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj ios/App/App/Info.plist
# Release notes (always — they're produced by step 2):
git add ios/fastlane/metadata/fr-CA/release_notes.txt
git add android/fastlane/metadata/android/fr-CA/changelogs/<newVersionCode>.txt
git add android/fastlane/metadata/android/en-US/changelogs/<newVersionCode>.txt
# Include Podfile + Podfile.lock IF cap sync added/removed a Capacitor pod:
git add ios/App/Podfile ios/App/Podfile.lock 2>/dev/null
```

**Do not stage** unrelated modified/untracked files (e.g. `app/components/*`, `yarn.lock`, untracked WIP). Inspect with `git status` first.

Commit message format (matches repo style — short, descriptive, no PR number):

```
Bump to X.Y.Z for App Store + Play production drafts

iOS: MARKETING_VERSION OLD→X.Y.Z, build N→N+1
Android: versionCode M→M+1, versionName OLD→X.Y.Z
[any extra notes, e.g. "Podfile picks up new Capacitor plugin from cap sync"]

Co-Authored-By: claude-flow <ruv@ruv.net>
```

### 8. Final summary

Report to the user:
- New version + build numbers per platform
- App Store Connect status: **draft, awaits manual submit for review**
- Play Console status: **production track, draft, awaits manual rollout**
- Commit SHA
- Any working-tree files left uncommitted (so they know)

## Failure recovery

- If iOS lane fails after `bump_build` ran: `CURRENT_PROJECT_VERSION` got incremented. That's fine — re-running just bumps it again, and TestFlight will accept the next number.
- If Android upload fails on `versionCode` collision: bump it again and retry. Each upload to Play needs a unique versionCode.
- If `cap sync ios` runs twice (once via the iOS lane's `prepare`, once if you ran it manually first): harmless, just slower.
