# LightStudio (Android)

LightStudio is a Java-based Android application built with Capacitor. It provides a native Android shell (BridgeActivity) for a web-backed editor/light-studio experience. The repository contains a single Android app module under `app/` and Gradle build configuration to compile and package the app.

This README gives a concise developer-oriented overview, build/run instructions, configuration notes (including Capacitor and Google Services), and security guidance for handling keys and service account files.

## Stack

- Language: Java
- Platform: Android (Gradle)
- Web-native bridge: Capacitor

## Project layout

```
app/                       Android application module (source, manifest, res)
  build.gradle             module Gradle config
  src/                     java, resources, manifest
  proguard-rules.pro       proguard/r8 rules
capacitor-cordova-android-plugins/  (subproject for Cordova plugin support)
build.gradle                root Gradle build
gradle.properties           Gradle properties
gradlew, gradlew.bat        Gradle wrapper
variables.gradle            shared build versions and variables
settings.gradle             project modules and Capacitor settings
```

## Getting started (developer)

Prerequisites
- Java JDK (17+ recommended by Android Gradle toolchain)
- Android SDK (platforms and build-tools matching compileSdkVersion)
- Android Studio (recommended) or command-line SDK tools
- A connected Android device or emulator

Quick build & install (from project root)

```bash
# build the debug APK
./gradlew :app:assembleDebug

# install to connected device/emulator
./gradlew :app:installDebug
```

Open in Android Studio
- Open the repository in Android Studio (File → Open) and run the `app` configuration.

Capacitor
- This project includes Capacitor integration. The Android module applies `capacitor.build.gradle`/`capacitor.settings.gradle` as part of the build.
- Web assets (the Capacitor web app) are expected to be placed under `app/src/main/assets/public` when integrated; that folder is currently ignored in .gitignore because it is typically generated/copied.

## Configuration

google-services.json
- If you use Firebase/Google services, place `google-services.json` in `app/`.
- The `app/build.gradle` will apply the Google services plugin only when `google-services.json` exists.
- Do NOT commit `google-services.json` to the repository; add it to your local .gitignore and use secure distribution for CI.

Signing keys
- Keep Android keystores (`*.jks`, `*.keystore`) out of source control. Configure signing in CI or local `gradle.properties`/`local.properties` and ensure keys are stored in a secret manager.

Environment & secrets
- Do not commit `.env`, `secrets.properties`, service account JSON, or private keys. Use CI/CD secret storage or a cloud secret manager.

## Security & repository hygiene

- This repository intentionally ignores common sensitive files in `.gitignore`. Ensure the following are never committed:
  - `google-services.json`, `*.jks`, `*.pem`, `*.p12`, `*.key`, `.env`, `secrets.properties`.
- Before publishing or sharing the repository publicly, run a history-aware secret scan (gitleaks, trufflehog, git-secrets) to ensure no secrets were committed earlier.
- If a secret is discovered in history, rotate/revoke it immediately and remove it from the git history (tools: `git-filter-repo` or `bfg`). See SECURITY.md or repository CONTRIBUTING for remediation steps.

## Development notes

- Entry point: `app/src/main/java/com/ailight/editor/MainActivity.java` — a minimal Capacitor BridgeActivity.
- Android SDK and dependency versions are defined in `variables.gradle`.
- Capacitor/cordova plugin stubs are under `capacitor-cordova-android-plugins/`.

## Contributing

- Please open issues or PRs describing the change.
- Add unit/instrumentation tests when applicable.
- Avoid committing secrets. Add `.gitignore` entries and pre-commit hooks that scan for secrets (recommended: pre-commit + detect-secrets or gitleaks pre-commit).

## License

This repository currently has no explicit license file. If you maintain this repo, add a LICENSE (for example MIT) to clarify terms.

---

If you want, I can:
- Add a SECURITY.md with immediate remediation steps and recommended scanning commands.
- Commit a recommended `.gitignore` patch and a pre-commit configuration (gitleaks/detect-secrets) to help prevent accidental commits of secrets.
