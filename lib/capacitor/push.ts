"use client";

/**
 * Capacitor native push notification bridge.
 *
 * On native (iOS/Android) this registers for push via APNs/FCM and sends
 * the device token to /api/notifications/push-register.
 * On web it's a no-op.
 */

const PUSH_TOKEN_KEY = "waterflow-push-token";

let initPromise: Promise<string | null> | null = null;

/** Get the stored push device token (null on web or if not yet registered). */
export function getPushToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PUSH_TOKEN_KEY);
}

/**
 * Initialize native push notifications and return the device token.
 *
 * - Returns the cached token immediately on subsequent calls.
 * - On web, or if permission is denied, resolves to null.
 * - On native, resolves once the `registration` listener fires with a token.
 */
export async function initPushNotifications(): Promise<string | null> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (typeof window === "undefined") return null;

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
      return null;
    }

    // Wait for the `registration` listener, or resolve early if we already
    // have a cached token from a previous session.
    const cached = getPushToken();

    const tokenPromise = new Promise<string | null>((resolve) => {
      let settled = false;
      const settle = (v: string | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      PushNotifications.addListener("registration", async (token) => {
        console.log("Push token:", token.value);
        localStorage.setItem(PUSH_TOKEN_KEY, token.value);
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
        settle(token.value);
      });

      PushNotifications.addListener("registrationError", (error) => {
        console.error("Push registration error:", error);
        settle(cached ?? null);
      });

      // Safety net: if registration doesn't fire within 10s but we have a
      // cached token, resolve with it so the caller isn't blocked forever.
      setTimeout(() => settle(cached ?? null), 10_000);
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

    // Register with APNs (iOS) / FCM (Android) — must be called AFTER listeners are registered.
    await PushNotifications.register();

    return tokenPromise;
  })();

  return initPromise;
}
