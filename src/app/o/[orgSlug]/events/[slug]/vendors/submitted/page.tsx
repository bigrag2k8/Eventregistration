import Link from "next/link";

export default function VendorSubmittedPage({ params }: { params: { orgSlug: string; slug: string } }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="card">
        <div className="text-4xl">📨</div>
        <h1 className="mt-3 text-2xl font-bold">Application submitted</h1>
        <p className="mt-2 text-slate-600">
          Thanks! The organizer will review your application and email you with next steps.
          Approved vendors receive a payment link to secure their booth.
        </p>
        <Link href={`/o/${params.orgSlug}/events/${params.slug}`} className="btn-primary mt-6 inline-block">
          Back to event
        </Link>
      </div>
    </main>
  );
}
