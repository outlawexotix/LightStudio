# Windows (Electron) — Build & Package

This folder documents a recommended Electron-based Windows packaging workflow using electron-builder.

Prerequisites
- Node.js 18+ and npm/yarn
- If building on Windows for Windows: Microsoft Build Tools (or use CI with windows-latest)

Typical workflow
1. Build web assets: from repo root `cd web && npm install && npm run build`
2. Prepare Electron app to load built assets from `web/dist/`
3. Install electron-builder and package:
   - `npm install`
   - `npm run build`        # builds the renderer (web) if scripts invoke it
   - `npm run package:win`  # example: electron-builder --win --x64

Example package.json scripts
{
  "scripts": {
    "build:web": "cd ../web && npm ci && npm run build",
    "package:win": "electron-builder --win --x64"
  }
}

Notes
- Adjust electron main process to point to `file://path/to/web/dist/index.html` in production.
- Use CI (GitHub Actions) to produce Windows artifacts if you don't want to manage a Windows host locally.
