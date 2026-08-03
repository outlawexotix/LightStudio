# LightStudio (Multi-platform)

LightStudio is a Java-based application that provides a web-backed editor/light-studio experience with native shells for multiple platforms. Historically this repository hosted an Android-capacitor shell; it now also includes support for a Windows desktop shell and a standalone web app (web assets). The native shells act as thin wrappers around the same web-based editor.

This README gives a concise developer-oriented overview, build/run instructions, configuration notes (including Capacitor and Google Services), and security guidance for handling keys and sensitive files.

## Stack

- Primary language: Java (Android native shell)
- Platforms: Android (Gradle), Windows (native shell), Web (web assets)
- Web-native bridge: Capacitor (web assets are the canonical editor source)

## Project layout

```
app/                       Android application module (source, manifest, res)
  build.gradle             module Gradle config
  src/                     java, resources, manifest
  proguard-rules.pro       proguard/r8 rules
capacitor-cordova-android-plugins/  (subproject for Cordova plugin support)
web/                       Optional: web application source (HTML/JS/CSS or frontend framework)
windows/                   Optional: Windows desktop shell / packaging helpers
build.gradle               root Gradle build
gradle.properties          Gradle properties
gradlew, gradlew.bat       Gradle wrapper
variables.gradle           shared build versions and variables
settings.gradle            project modules and Capacitor settings
```

Note: platform-specific folders such as `web/` and `windows/` may be present if that platform's sources are maintained in this repository. The canonical editor UI is web-first — native shells embed these web assets.

## Getting started (developer)

Prerequisites
- Java JDK (17+ recommended by Android Gradle toolchain)
- Android SDK (platforms and build-tools matching compileSdkVersion)
- Android Studio (recommended) or command-line SDK tools
- A connected Android device or emulator for Android testing
- For web development: Node.js and npm/yarn (if the web frontend is built with a JS toolchain)
- For Windows packaging: platform-specific toolchain (see `windows/` README if present)

Quick build & install (from project root)

```bash
# build the debug APK
./gradlew :app:assembleDebug

# install to connected device/emulator
./gradlew :app:installDebug
```

Web app (build & integrate)

- The web editor is the canonical source of the UI. If the repository includes a `web/` directory, build the web assets there (for example `npm install && npm run build`).
- To run the web app standalone, follow instructions in `web/` (if present) or open the built `index.html` in a static server.
- To use the web build with native shells, copy the compiled web assets into the Android assets folder or the platform-specific assets location. Common target paths include `app/src/main/assets/public` for Android.

Windows app (desktop shell)

- This repository may include a `windows/` desktop wrapper that loads the same web assets used by Android. Platform-specific build and packaging instructions (for example, an Electron or native WebView wrapper) should live in `windows/`.
- Check `windows/README.md` or scripts in `windows/` for exact build steps. If no dedicated Windows instructions are present, the general approach is to build the web assets and then use the Windows shell tooling in this repo to package those assets into a desktop executable.

Open in Android Studio
- Open the repository in Android Studio (File → Open) and run the `app` configuration.

Capacitor
- This project includes Capacitor integration. The Android module applies `capacitor.build.gradle`/`capacitor.settings.gradle` as part of the build.
- Web assets (the Capacitor web app) are expected to be placed under `app/src/main/assets/public` when integrated; that folder is typically generated and is often ignored in `.gitignore`.

## Configuration

google-services.json
- If you use Firebase/Google services, place `google-services.json` in `app/`.
- The `app/build.gradle` will apply the Google services plugin only when `google-services.json` exists.
- Do NOT commit `google-services.json` to the repository; add it to your local `.gitignore` and use secure distribution for CI.

Signing keys
- Keep Android keystores (`*.jks`, `*.keystore`) out of source control. Configure signing in CI or local `gradle.properties`/`local.properties` and ensure keys are stored in a secret manager.

Environment & secrets
- Do not commit `.env`, `secrets.properties`, service account JSON, or private keys. Use CI/CD secret storage or a cloud secret manager.

## Security & repository hygiene

- This repository intentionally ignores common sensitive files in `.gitignore`. Ensure the following are never committed:
  - `google-services.json`, `*.jks`, `*.pem`, `*.p12`, `*.key`, `.env`, `secrets.properties`.
- Before publishing or sharing the repository publicly, run a history-aware secret scan (gitleaks, trufflehog, git-secrets) to ensure no secrets were committed earlier.
- If a secret is discovered in history, rotate/revoke it immediately and remove it from the git history (tools: `git-filter-repo` or `bfg`). See SECURITY.md or repository CONTRIBUTING for remediation guidance.

## Development notes

- Entry point: `app/src/main/java/com/ailight/editor/MainActivity.java` — a minimal Capacitor BridgeActivity that hosts the web editor.
- Android SDK and dependency versions are defined in `variables.gradle`.
- Capacitor/cordova plugin stubs are under `capacitor-cordova-android-plugins/`.
- If present, platform-specific code or packaging helpers for the web or Windows builds live under `web/` and `windows/` respectively.

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
- Add platform-specific README files under `web/` and `windows/` with example build commands — tell me the exact build toolchain and I will draft them.
