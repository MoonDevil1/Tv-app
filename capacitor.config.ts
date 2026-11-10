import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moondevil1.livetgtv',
  appName: 'LiveTGTV',
  webDir: 'dist',
  android: { backgroundColor: '#080b12' },
  plugins: {
    CapacitorHttp: { enabled: true }
  }
};

export default config;
