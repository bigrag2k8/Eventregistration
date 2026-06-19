"use client";

import { useState } from "react";

interface Props {
  orgId: string;
  orgName: string;
  members: number;
  events: number;
  /**
   * Server action to perform the delete. Imported from the org page so this
   * client component stays decoupled from the server module.
   */
  deleteAction: (formData: FormData) => Promise<void>;
}

/**
 * Danger Zone card for permanently deleting an organization. Mirrors the
 * factory-reset card's confirm pattern: the button is gated by typing the
 * exact org name (case-insensitive) so a stray click on the wrong /admin/orgs
 * tab can't wipe data. The actual destructive work happens in
 * `deleteOrgAction` server-side; this just collects the typed confirmation.
 */
export function DeleteOrgCard({ orgId, orgName, members, events, deleteAction }: Props) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const canSubmit = phrase.trim().toLowerCase() === orgName.trim().toLowerCase();

  return (
    <div className="mt-12 rounded-xl border-2 border-red-300 bg-red-50/50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-red-900">⚠ Danger zone — Delete organization</h2>
          <p className="mt-1 text-sm text-red-900/80">
            Permanently deletes <strong>{orgName}</strong> and everything tied to it.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900/80">
            <li>All {events} event{events === 1 ? "" : "s"} and their registrations, tickets, payments, vendor applications, promo codes, and check-ins</li>
            <li>All team accounts in this org — organizers, staff, volunteers, and org admins ({members} member{members === 1 ? "" : "s"} total)</li>
            <li>All pending invites for this org</li>
            <li>The org&rsquo;s branding, subscription, credits, and Stripe Connect link</li>
          </ul>
          <p className="mt-2 text-xs text-red-900/70">
            Attendees who only registered for this org&rsquo;s events keep their accounts (their registrations to this org go with the events). SUPERADMINs and historical audit logs survive.
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Show delete controls
          </button>
        )}
      </div>

      {open && (
        <form action={deleteAction} className="mt-4 space-y-3 border-t border-red-200 pt-4">
          <input type="hidden" name="orgId" value={orgId} />
          <label className="block text-sm font-medium text-red-900">
            Type the org name <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono">{orgName}</span> to confirm:
          </label>
          <input
            type="text"
            name="confirmName"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={orgName}
            className="input font-mono"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete organization permanently
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPhrase(""); }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
