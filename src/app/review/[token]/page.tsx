import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { verifyReviewTokenResult } from "@/lib/auth";
import { OrgBrandStyle } from "@/components/OrgBrandStyle";
import { ReviewForm } from "@/components/ReviewForm";
import { PartyPopper, Ticket } from "lucide-react";

export const dynamic = "force-dynamic";

const BRAND_RE = /^#[0-9A-Fa-f]{6}$/;

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}

function stars(n: number) {
  return (
    <span style={{ color: "#EF9F27", fontSize: "18px", letterSpacing: "1px" }}>
      {"★".repeat(n)}
      <span style={{ color: "#cbd5e1" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { rating?: string; submitted?: string; error?: string };
}) {
  const { claim, reason } = await verifyReviewTokenResult(params.token);
  if (!claim) {
    // "Expired" is only shown for a REAL exp lapse. Anything else is an invalid
    // link, and saying "expired" there hid a signing-key mismatch for its whole
    // lifetime — the message looked like normal housekeeping.
    return reason === "expired" ? (
      <Shell>
        <h1 className="text-xl font-semibold">This review link has expired</h1>
        <p className="mt-2 text-slate-600">
          Review links stay valid for 60 days after an event. If yours has lapsed, no worries — thanks
          for coming out.
        </p>
      </Shell>
    ) : (
      <Shell>
        <h1 className="text-xl font-semibold">This review link isn&rsquo;t valid</h1>
        <p className="mt-2 text-slate-600">
          The link may have been copied incompletely — try clicking it straight from the email instead of
          pasting it. If it still doesn&rsquo;t work, reply to that email and the organizer can sort it out.
        </p>
      </Shell>
    );
  }

  const reg = await prisma.registration.findUnique({
    where: { id: claim.registrationId },
    include: {
      event: { select: { name: true, endAt: true, startAt: true, timezone: true } },
      tickets: { select: { checkIn: { select: { id: true } } } },
      review: true,
      // organization brand for the accent color
    },
  });
  if (!reg) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">We couldn&rsquo;t find that registration</h1>
        <p className="mt-2 text-slate-600">This review link is no longer valid.</p>
      </Shell>
    );
  }

  const org = await prisma.organization.findFirst({
    where: { events: { some: { id: reg.eventId } } },
    select: { name: true, brandColor: true, logoUrl: true },
  });
  const brand = org?.brandColor && BRAND_RE.test(org.brandColor) ? org.brandColor : "#1F3A8A";
  const attended = reg.tickets.some((t) => t.checkIn);

  // Thank-you state, shown after a successful submit.
  if (searchParams.submitted && reg.review) {
    return (
      <Shell>
        <OrgBrandStyle color={org?.brandColor ?? null} />
        <div className="text-center">
          <PartyPopper className="mx-auto h-9 w-9 text-brand-600" aria-hidden />
          <h1 className="mt-2 text-xl font-semibold">Thanks for the review!</h1>
          <div className="mt-3">{stars(reg.review.rating)}</div>
          {reg.review.comment && (
            <p className="mx-auto mt-3 max-w-sm whitespace-pre-line text-slate-600">{reg.review.comment}</p>
          )}
          <p className="mt-4 text-sm text-slate-500">
            It helps other attendees find great organizers. You can revisit this link to edit your review.
          </p>
        </div>
      </Shell>
    );
  }

  // Event hasn't ended yet — reviews open only afterward.
  if (reg.event.endAt >= new Date()) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Come back after the event</h1>
        <p className="mt-2 text-slate-600">
          You&rsquo;ll be able to review <strong>{reg.event.name}</strong> once it wraps up. We&rsquo;ll email you
          a reminder.
        </p>
      </Shell>
    );
  }

  // Only verified (confirmed) attendees can review.
  if (reg.status !== "CONFIRMED") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This registration can&rsquo;t be reviewed</h1>
        <p className="mt-2 text-slate-600">
          Reviews are open to confirmed attendees. If your registration was cancelled or refunded, there&rsquo;s
          nothing to review.
        </p>
      </Shell>
    );
  }

  const paramRating = Number(searchParams.rating);
  const initialRating = reg.review
    ? reg.review.rating
    : Number.isInteger(paramRating) && paramRating >= 1 && paramRating <= 5
      ? paramRating
      : 0;

  const errorMsg: Record<string, string> = {
    invalid: "Please choose a star rating.",
    expired: "This review link has expired.",
    rate: "Too many attempts — please wait a moment and try again.",
    ineligible: "Only confirmed attendees can leave a review.",
    too_early: "You can review once the event has ended.",
  };

  return (
    <Shell>
      <OrgBrandStyle color={org?.brandColor ?? null} />
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: brand }}
        >
          <Ticket className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{reg.event.name}</div>
          {org?.name && <div className="text-xs text-slate-500">{org.name}</div>}
        </div>
        {attended && (
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 ring-1 ring-emerald-200">
            ✓ Attended
          </span>
        )}
      </div>

      {searchParams.error && errorMsg[searchParams.error] && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {errorMsg[searchParams.error]}
        </div>
      )}

      <ReviewForm
        token={params.token}
        initialRating={initialRating}
        initialComment={reg.review?.comment ?? ""}
        initialSub={{
          venue: reg.review?.ratingVenue ?? 0,
          value: reg.review?.ratingValue ?? 0,
          organization: reg.review?.ratingOrganization ?? 0,
        }}
        editing={!!reg.review}
        brand={brand}
      />
    </Shell>
  );
}
