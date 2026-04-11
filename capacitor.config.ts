import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ckrsrivers.app",
  appName: "CKRS Rivers",
  // Server-rendered app: Capacitor loads the deployed URL in the WebView.
  // Change this to your production Vercel URL before building for release.
  server: {
    url: "https://water-flow-eight.vercel.app/",
    cleartext: false, // allow HTTP in dev — remove for production HTTPS
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "CKRSRivers",
  },
  android: {
    backgroundColor: "#ffffff",
    includePlugins: [
      "@capacitor/app",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
      "@capacitor/push-notifications",
    ],
  },
};

export default config;
