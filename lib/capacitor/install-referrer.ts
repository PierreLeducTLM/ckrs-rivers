import { registerPlugin } from "@capacitor/core";

/**
 * Capacitor plugin shim for Google Play's Install Referrer API.
 *
 * Implemented by `android/app/src/main/java/.../InstallReferrerPlugin.java`.
 * On non-Android platforms (iOS, web) the call rejects — wrap call sites in
 * try / catch and treat that as "no referrer available".
 */
export interface InstallReferrerPlugin {
  getReferrer(): Promise<{ referrer: string }>;
}

export const InstallReferrer = registerPlugin<InstallReferrerPlugin>(
  "InstallReferrer",
);
