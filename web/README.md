# Web (React + Vite) — Build & Run

This folder documents the recommended web toolchain and how to produce the web assets used by native shells.

Prerequisites
- Node.js 18+ (LTS), npm or yarn

Common commands (example package.json scripts):
- Install: `npm install`
- Dev server: `npm run dev`            # runs Vite for local development
- Build: `npm run build`              # outputs production assets to `dist/`
- Preview: `npm run preview`          # preview the built site

Integrating with native shells
- Build web assets: `npm run build`
- Android (Capacitor): copy `dist/` contents into `app/src/main/assets/public/`
  or run an integration script such as `npm run copy:android`
- Windows (Electron): package the built `dist/` directory with the Windows shell (see ../windows/README.md)

Example npm scripts (package.json)
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "copy:android": "cp -r dist/* ../app/src/main/assets/public/"
  }
}
