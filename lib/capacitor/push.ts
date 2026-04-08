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

  // Register with APNs/FCM
  await PushNotifications.register();
  initialized = true;
}
