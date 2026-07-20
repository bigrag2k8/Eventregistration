import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Recurring events are now created through the single "Create Event" button →
 * the format chooser → Recurring. This old direct route redirects into that
 * unified flow (pre-selecting the Recurring format) so bookmarks keep working.
 * Any ?bought=RECURRING_EVENT_CREDIT return from checkout is carried through.
 */
export default function NewRecurringEventPage({ searchParams }: { searchParams: { bought?: string } }) {
  const q = new URLSearchParams({ format: "recurring" });
  if (searchParams?.bought) q.set("bought", searchParams.bought);
  redirect(`/dashboard/events/new?${q.toString()}`);
}
