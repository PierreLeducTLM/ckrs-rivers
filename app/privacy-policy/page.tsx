import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CKRS Rivers",
  description: "Privacy policy for the CKRS Rivers application",
};

export default function PrivacyPolicyPage() {
  const effectiveDate = "2025-04-10";
  const contactEmail = "info@ckrsrivers.com";
  const appName = "CKRS Rivers";
  const developerName = "CKRS Rivers";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        &larr; Back
      </Link>

      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        Effective date: {effectiveDate}
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold">
        <section>
          <h2>1. Introduction</h2>
          <p>
            {developerName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
            operates the {appName} mobile application (the
            &quot;App&quot;). This Privacy Policy explains how we collect, use,
            and protect your information when you use our App.
          </p>
          <p>
            By using the App, you agree to the collection and use of information
            in accordance with this policy.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>

          <h3 className="mt-4 font-medium">
            2.1 Information you provide directly
          </h3>
          <ul className="list-disc pl-5">
            <li>
              <strong>Email address</strong> &mdash; When you subscribe to
              flow-alert notifications, we collect your email address to send you
              alerts about river conditions.
            </li>
            <li>
              <strong>Notification preferences</strong> &mdash; Your chosen alert
              thresholds and station subscriptions.
            </li>
          </ul>

          <h3 className="mt-4 font-medium">
            2.2 Information collected automatically
          </h3>
          <ul className="list-disc pl-5">
            <li>
              <strong>Push notification tokens</strong> &mdash; If you enable
              push notifications, we receive a device token from Apple Push
              Notification Service (APNs) or Firebase Cloud Messaging (FCM) to
              deliver alerts to your device.
            </li>
            <li>
              <strong>Basic usage data</strong> &mdash; Standard web server logs
              (IP address, request timestamps, pages visited). We do not use
              third-party analytics or tracking SDKs.
            </li>
          </ul>

          <h3 className="mt-4 font-medium">2.3 Information we do NOT collect</h3>
          <ul className="list-disc pl-5">
            <li>We do not collect your precise location.</li>
            <li>We do not collect personal identifiers beyond your email address.</li>
            <li>We do not collect financial or payment information.</li>
            <li>We do not use cookies for advertising or tracking purposes.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul className="list-disc pl-5">
            <li>
              To send you river flow alert notifications by email or push
              notification based on your subscriptions.
            </li>
            <li>To confirm your email address when subscribing to alerts.</li>
            <li>To operate and maintain the App.</li>
            <li>
              To improve the App based on aggregated, anonymized usage patterns.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Data Sharing and Disclosure</h2>
          <p>
            We do not sell, trade, or rent your personal information to third
            parties. We may share information only in the following
            circumstances:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Service providers</strong> &mdash; We use third-party
              services to deliver email notifications and host the App (e.g.,
              Vercel for hosting, Resend or similar for email delivery). These
              providers only process your data on our behalf and are obligated to
              protect it.
            </li>
            <li>
              <strong>Legal requirements</strong> &mdash; We may disclose your
              information if required to do so by law or in response to valid
              legal requests.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Data Retention</h2>
          <p>
            We retain your email address and notification preferences for as
            long as your subscription is active. You can unsubscribe at any time
            using the link in any notification email, and your data will be
            deleted.
          </p>
          <p>
            Push notification tokens are deleted when you uninstall the App or
            revoke notification permissions.
          </p>
        </section>

        <section>
          <h2>6. Data Security</h2>
          <p>
            We use commercially reasonable measures to protect your personal
            information, including encrypted connections (HTTPS) for all data
            transmission. However, no method of transmission over the Internet
            is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>7. Children&apos;s Privacy</h2>
          <p>
            The App is not intended for children under the age of 13. We do not
            knowingly collect personal information from children under 13. If
            you believe we have inadvertently collected such information, please
            contact us and we will promptly delete it.
          </p>
        </section>

        <section>
          <h2>8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-5">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your data.</li>
            <li>
              Unsubscribe from notifications at any time via the unsubscribe
              link in emails or by contacting us.
            </li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href={`mailto:${contactEmail}`} className="underline">
              {contactEmail}
            </a>
            .
          </p>
        </section>

        <section>
          <h2>9. Third-Party Services</h2>
          <p>The App may display data sourced from public government agencies (e.g., CEHQ hydrometric stations, Environment Canada weather data). These are public datasets and are not personal information.</p>
          <p>The App may contain links to external websites. We are not responsible for the privacy practices of third-party sites.</p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of any changes by posting the new policy on this page and
            updating the effective date. You are advised to review this page
            periodically.
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy, please
            contact us at:
          </p>
          <p>
            <a href={`mailto:${contactEmail}`} className="underline">
              {contactEmail}
            </a>
          </p>
        </section>
      </div>

      <p className="mt-10 text-center text-xs text-gray-400 dark:text-gray-500">
        &copy; {new Date().getFullYear()} {developerName}. All rights reserved.
      </p>
    </main>
  );
}
