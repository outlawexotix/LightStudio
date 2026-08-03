# Lumina Light Studio

Lumina Light Studio is an AI-assisted photo relighting editor for the web,
Windows, and Android. It combines a React/Vite interface, a hardened
Express/Gemini backend, an Electron desktop shell, and a Capacitor Android app.

## Project layout

```text
components/       React editor components
electron/         Electron main and preload processes
services/         image generation, presets, export, and scene tools
tests/            server integration tests
android/          Android Studio and Gradle project
server.ts         Express API and production web server
App.tsx           main editor UI
```

Generated folders such as `dist`, `dist-desktop`, `dist-electron`,
`node_modules`, Android build outputs, and local environment files are not
committed.

## Prerequisites

- Node.js 20 or newer
- pnpm
- A Gemini API key for image generation
- Android Studio, Android SDK, and JDK 21 for Android builds

## Setup

```powershell
pnpm install
Copy-Item .env.example .env.local
```

Add your server-side `GEMINI_API_KEY` to `.env.local`. Never commit that file.
Review `.env.example` for deployment origins, API access tokens, model
allowlists, image-host allowlists, and resource limits.

## Web development

```powershell
pnpm dev
```

Open `http://localhost:3000`.

## Windows desktop

Run the desktop app against the development server:

```powershell
pnpm desktop:dev
```

Build the portable Windows application:

```powershell
pnpm desktop:build
```

The packaged application is written to `dist-electron`. The production desktop
server loads Vite only in development, binds to loopback on an available port,
and protects API requests with a per-launch access token.

## Android

The Android project lives under `android/`. Rebuild and sync the web UI before
opening it in Android Studio:

```powershell
pnpm android:sync
pnpm android:open
```

For emulator development, start the backend and sync the emulator mode in
separate terminals:

```powershell
pnpm dev
pnpm android:sync:emulator
```

For a USB- or Wi-Fi-debugged device:

```powershell
pnpm android:sync:device
adb reverse tcp:3000 tcp:3000
```

Production Android builds require a public HTTPS backend URL and private release
signing. The Gemini key must remain on the server and must never be bundled into
the app.

## Production server

```powershell
pnpm build
$env:NODE_ENV = 'production'
$env:GEMINI_API_KEY = 'your_server_side_key'
$env:API_ACCESS_TOKEN = 'your_long_random_access_token'
$env:HOST = '0.0.0.0'
pnpm start
```

Use a real authentication layer and gateway-level abuse protection for a public
deployment. A shared `VITE_API_ACCESS_TOKEN` is suitable only for a private,
self-hosted client because Vite embeds it in the client bundle.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
```

See `SECURITY.md` and `CONTRIBUTING.md` for secret-handling and contribution
requirements.

## License

MIT. See `LICENSE`.
