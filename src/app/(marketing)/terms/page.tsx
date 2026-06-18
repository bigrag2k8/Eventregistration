export const metadata = {
  title: "Terms of Service — Your Events App",
  description: "The terms that govern use of Your Events App.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: June 18, 2026</p>

      <p className="mt-6 text-sm leading-relaxed text-slate-700">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Your Events App
        (the &ldquo;Service&rdquo;). By creating an account, hosting an event, or registering for an
        event, you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <Section title="1. The Service">
        <p>
          Your Events App provides tools for organizations (&ldquo;Organizers&rdquo;) to create
          events, sell tickets, collect registrations, manage attendees, and check guests in. People
          who register for or buy tickets to those events are &ldquo;Attendees.&rdquo;
        </p>
      </Section>

      <Section title="2. Accounts">
        <p>
          You are responsible for the accuracy of the information you provide and for keeping your
          login credentials secure. You are responsible for all activity that occurs under your
          account. Notify us promptly of any unauthorized use.
        </p>
      </Section>

      <Section title="3. Organizer responsibilities">
        <p>
          Organizers are solely responsible for their events, including event content, pricing, the
          accuracy of event listings, communications with Attendees, applicable taxes, and compliance
          with all laws that apply to their events. Organizers set and are responsible for their own
          refund and cancellation policies.
        </p>
      </Section>

      <Section title="4. Payments, fees, and payouts">
        <p>
          Card payments are processed by Stripe. Organizers must connect a Stripe account to receive
          funds; payouts are made to that account on Stripe&apos;s payout schedule and are subject to
          Stripe&apos;s terms. Platform and payment-processing fees are disclosed before you complete a
          transaction. You authorize us and Stripe to charge applicable fees.
        </p>
      </Section>

      <Section title="5. Refunds">
        <p>
          Refunds are governed by the Organizer&apos;s stated policy for each event. Where a refund is
          issued, it is returned to the original payment method. We are not a party to the agreement
          between an Organizer and an Attendee and are not responsible for an Organizer&apos;s refund
          decisions.
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>violate any law or the rights of others;</li>
          <li>post fraudulent, misleading, infringing, or harmful content;</li>
          <li>sell tickets to unlawful events or for events you are not authorized to run;</li>
          <li>interfere with, probe, or disrupt the Service or its security; or</li>
          <li>misuse another user&apos;s data or attempt to access accounts that are not yours.</li>
        </ul>
      </Section>

      <Section title="7. Content & intellectual property">
        <p>
          You retain ownership of the content you submit, and you grant us a license to host and
          display it as needed to operate the Service. The Service itself, including its software and
          branding, remains our property and may not be copied or reused without permission.
        </p>
      </Section>

      <Section title="8. Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind, to the fullest
          extent permitted by law. We do not warrant that the Service will be uninterrupted or
          error-free.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Your Events App will not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or for any loss of
          profits, revenue, data, or goodwill arising from your use of the Service.
        </p>
      </Section>

      <Section title="10. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          breach these Terms or use the Service in a way that risks harm to others or to the platform.
        </p>
      </Section>

      <Section title="11. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating
          the date above, and your continued use of the Service constitutes acceptance of the updated
          Terms.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:events@yourevents.app" className="text-brand-700 hover:underline">
            events@yourevents.app
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
