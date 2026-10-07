// App Android nativo (Capacitor): empacota o app web (dist/) e usa alarmes do próprio Android
// para os lembretes e o resumo diário (chegam na hora, sem Chrome e sem internet).
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.tvbr.cob', // mesmo id do APK antigo: instala por cima
  appName: 'TVBR.Cob',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#5E17EB',
    },
  },
};

export default config;
