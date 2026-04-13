"use client";

/**
 * Capacitor native push notification bridge.
 *
 * On native (iOS/Android) this registers for push via APNs/FCM and sends
 * the device token to /api/notifications/push-register.
 * On web it's a no-op.
 */

const PUSH_TOKEN_KEY = "waterflow-push-token";

/** Module-scoped pending promise so repeated calls share the same registration. */
let pendingRegistration: Promise<string | null> | null = null;

/** Get the stored push device token (null on web or if not yet registered). */
export function getPushToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PUSH_TOKEN_KEY);
}

/**
 * Register for push notifications and return the device token.
 *
 * Returns a Promise that resolves with the token once APNs/FCM registration
 * completes, or null if permission is denied or not on native.
 * Repeated calls return the same pending promise (memo).
 */
export function initPushNotifications(): Promise<string | null> {
  // Return cached token immediately if already registered
  const existing = getPushToken();
  if (existing) return Promise.resolve(existing);

  // Reuse in-flight registration
  if (pendingRegistration) return pendingRegistration;

  pendingRegistration = doInit();
  return pendingRegistration;
}

async function doInit(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // Only run inside Capacitor native shell
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Check / request permission
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    console.log("Push notification permission denied");
    pendingRegistration = null;
    return null;
  }

  // Wait for the registration listener to fire
  const token = await new Promise<string | null>((resolve) => {
    PushNotifications.addListener("registration", async (reg) => {
      console.log("Push token:", reg.value);
      localStorage.setItem(PUSH_TOKEN_KEY, reg.value);
      try {
        await fetch("/api/notifications/push-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: reg.value,
            platform: Capacitor.getPlatform(), // 'ios' | 'android'
          }),
        });
      } catch (e) {
        console.error("Failed to register push token:", e);
      }
      resolve(reg.value);
    });

    PushNotifications.addListener("registrationError", (error) => {
      console.error("Push registration error:", error);
      resolve(null);
    });

    // Register with APNs (iOS) / FCM (Android)
    PushNotifications.register();
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

  if (!token) pendingRegistration = null;
  return token;
}
