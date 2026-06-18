import Link from "next/link";

export const metadata = {
  title: "About — Your Events App",
  description: "Why Your Events App exists and who it's for.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">About Your Events App</h1>

      <div className="mt-8 space-y-5 text-base leading-relaxed text-slate-700">
        <p>
          Your Events App is a modern platform for event registration, ticketing, and check-in —
          built for organizations of every size, from a single community meetup to a multi-day
          conference.
        </p>
        <p>
          Most event tools are either too basic to run a real event or too expensive and complex for
          the organizers who need them most. We took a different approach: host free events at no
          cost, and unlock the full feature set for a single event with one simple payment — no
          subscription, no lock-in.
        </p>
        <p>
          Everything is in one place. Build a branded event page, sell tickets, manage promo codes
          and waitlists, take vendor applications, check attendees in with secure QR codes, and get
          paid directly to your own Stripe account — all from a single dashboard.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/signup" className="btn-primary">Get started</Link>
        <Link href="/how-it-works" className="btn-secondary">See how it works</Link>
      </div>
    </main>
  );
}
