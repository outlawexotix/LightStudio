import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ailight.editor',
  appName: 'AI Light Editor',
  webDir: 'dist/web',
  android: {
    // HTTP remains blocked in release builds by the production manifest. This
    // setting only lets the debug WebView reach the host-side emulator server.
    allowMixedContent: true,
  },
};

export default config;
