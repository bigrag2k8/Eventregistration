export const metadata = {
  title: "Privacy Policy — Your Events App",
  description: "How Your Events App collects, uses, and protects your data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: June 18, 2026</p>

      <p className="mt-6 text-sm leading-relaxed text-slate-700">
        This Privacy Policy explains what information Your Events App (the &ldquo;Service&rdquo;)
        collects, how we use it, and the choices you have. By using the Service, you agree to the
        practices described here.
      </p>

      <Section title="Information we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-medium">Account information</span> — your name and email address,
            and a securely hashed password (we never store your password in plain text).
          </li>
          <li>
            <span className="font-medium">Event and registration data</span> — events you create or
            register for, ticket selections, and information you submit on registration forms.
          </li>
          <li>
            <span className="font-medium">Payment information</span> — card payments are handled by
            Stripe. We receive confirmation of a payment and limited details (such as amount and
            status) but do not collect or store full card numbers.
          </li>
          <li>
            <span className="font-medium">Technical data</span> — basic information needed to operate
            and secure the Service, such as session cookies and error logs.
          </li>
        </ul>
      </Section>

      <Section title="How we use information">
        <ul className="ml-5 list-disc space-y-1">
          <li>to operate the Service — create events, process registrations, and check attendees in;</li>
          <li>to process payments and payouts;</li>
          <li>to send transactional email such as confirmations, tickets, and reminders;</li>
          <li>to provide support and respond to your requests; and</li>
          <li>to maintain the security and integrity of the platform.</li>
        </ul>
      </Section>

      <Section title="Service providers we share data with">
        <p>
          We use a small number of trusted providers to run the Service, and share only the data
          needed for each to do its job:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li><span className="font-medium">Stripe</span> — payment processing and payouts;</li>
          <li><span className="font-medium">Resend</span> — sending transactional email;</li>
          <li><span className="font-medium">Railway</span> — application hosting and database;</li>
          <li><span className="font-medium">Cloudinary</span> — storage of event images you upload;</li>
          <li><span className="font-medium">Google Maps</span> — displaying event locations.</li>
        </ul>
        <p>
          When you register for an event, the relevant registration details are shared with that
          event&apos;s Organizer so they can manage their event. We do not sell your personal
          information.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use cookies that are necessary to keep you signed in and to keep the Service secure. We
          do not use them to sell your data.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We keep your information for as long as your account is active or as needed to provide the
          Service, comply with legal obligations, resolve disputes, and enforce our agreements.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use industry-standard measures to protect your data, including encryption in transit,
          hashed passwords, and access controls. No system is perfectly secure, but we work to keep
          your information safe.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can access and update your account information at any time from your profile. To request
          a copy of your data or to delete your account, contact us and we will respond in line with
          applicable law.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect personal
          information from them.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by updating
          the date above.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about your privacy? Email{" "}
          <a href="mailto:events@yourevents.app" className="text-brand-700 hover:underline">
            events@yourevents.app
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
