package com.flowcast.paddle.app;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes Google Play's Install Referrer API to the WebView. The DDL flow
 * embeds a clickId in the Play Store install URL via the
 * `&referrer=ddl_clickid=...` query param; on first launch we read it back here
 * so the app can navigate to the originally shared river/point.
 *
 * Returns an empty string when the device isn't a Play install or the API is
 * unavailable — callers fall back to fingerprint matching in that case.
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void getReferrer(final PluginCall call) {
        final InstallReferrerClient client = InstallReferrerClient
            .newBuilder(getContext())
            .build();

        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                JSObject ret = new JSObject();
                String referrer = "";
                if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                    try {
                        ReferrerDetails details = client.getInstallReferrer();
                        if (details != null && details.getInstallReferrer() != null) {
                            referrer = details.getInstallReferrer();
                        }
                    } catch (Exception ignored) {
                        // Leave referrer empty.
                    }
                }
                try {
                    client.endConnection();
                } catch (Exception ignored) {
                    // No-op.
                }
                ret.put("referrer", referrer);
                call.resolve(ret);
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                // No-op — the SDK will reconnect on the next call if needed.
            }
        });
    }
}
