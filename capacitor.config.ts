import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.waterflow.app",
  appName: "WaterFlow",
  // Server-rendered app: Capacitor loads the deployed URL in the WebView.
  // Change this to your production Vercel URL before building for release.
  server: {
    url: "https://water-flow-eight.vercel.app/",
    cleartext: true, // allow HTTP in dev — remove for production HTTPS
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "WaterFlow",
  },
  android: {
    backgroundColor: "#0a0a0a",
    // Exclude push-notifications until Firebase (google-services.json) is configured.
    // The native plugin crashes without Firebase — it's not catchable from JS.
    includePlugins: [
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
    ],
  },
};

export default config;
