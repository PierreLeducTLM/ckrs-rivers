"use client";

/**
 * Capacitor native push notification bridge.
 *
 * On native (iOS/Android) this registers for push via APNs/FCM and sends
 * the device token to /api/notifications/push-register.
 * On web it's a no-op.
 */

let initialized = false;

export async function initPushNotifications() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  // Only run inside Capacitor native shell
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;

  // Android requires Firebase (google-services.json) to be configured before
  // any push notification API call. The native plugin crashes the app on a
  // background thread (not catchable from JS) if Firebase is missing.
  // Skip push entirely on Android until Firebase is set up.
  if (Capacitor.getPlatform() === "android") {
    console.log("Push notifications skipped on Android — Firebase not configured yet");
    initialized = true;
    return;
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Check / request permission
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    console.log("Push notification permission denied");
    return;
  }

  // Listen for registration
  PushNotifications.addListener("registration", async (token) => {
    console.log("Push token:", token.value);
    try {
      await fetch("/api/notifications/push-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.value,
          platform: Capacitor.getPlatform(), // 'ios' | 'android'
        }),
      });
    } catch (e) {
      console.error("Failed to register push token:", e);
    }
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration error:", error);
  });

  // Handle received notifications when app is in foreground
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push received:", notification);
  });

  // Handle notification tap (app opened from notification)
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data;
    if (data?.stationId) {
      window.location.href = `/rivers/${data.stationId}`;
    }
  });

  // Register with APNs (iOS only at this point — Android is skipped above)
  await PushNotifications.register();
  initialized = true;
}
