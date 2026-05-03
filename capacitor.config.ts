import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.flowcast.paddle.app",
  appName: "FlowCast",
  // Server-rendered app: Capacitor loads the deployed URL in the WebView.
  // Change this to your production Vercel URL before building for release.
  server: {
    url: "https://www.flowcast.ca/",
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
    scheme: "FlowCast",
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
