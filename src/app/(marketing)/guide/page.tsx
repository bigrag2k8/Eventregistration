import Link from "next/link";
import { UserGuideShell, PrintGuideButton } from "@/components/UserGuideShell";

export const metadata = {
  title: "User Guide — YourEvents",
  description:
    "Complete how-to documentation for attendees, organizers, vendors, staff, and platform admins. Searchable and printable.",
};

/**
 * Long-form, searchable user guide. The UserGuideShell client component
 * extracts headings into a sticky TOC, runs in-page text search with
 * highlighting, and tracks scroll position to highlight the active section.
 * Page-level content here is plain JSX so it can be statically rendered AND
 * cleanly converted to .docx (see /docs/YourEvents-User-Guide.docx).
 *
 * If you add a major section, follow the H2/H3 convention — every H2 becomes a
 * top-level TOC entry, every H3 nests under it.
 */
export default function UserGuidePage() {
  return (
    <main>
      <section className="border-b bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
            Support
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">YourEvents User Guide</h1>
          <p className="mt-3 max-w-3xl text-lg text-slate-600">
            Step-by-step how-tos for everyone who uses YourEvents — attendees buying tickets,
            organizers hosting events, vendors applying for booths, staff running check-in, and
            platform admins managing the whole thing. Use the search box in the sidebar to find any
            topic.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <a
              href="/YourEvents-User-Guide.docx"
              className="btn-secondary"
              download
            >
              Download Word version
            </a>
            <PrintGuideButton />
            <Link href="/help" className="text-slate-600 hover:text-brand-700">
              Or jump to the FAQ →
            </Link>
          </div>
        </div>
      </section>

      <UserGuideShell>
        <h2>1. Document overview</h2>
        <p>
          <strong>YourEvents</strong> is a community-first event registration and ticketing platform.
          Each organization (the people hosting events) gets its own branded space at{" "}
          <code>yourevents.app/o/your-org</code>, where attendees register, pay, and receive QR-coded
          tickets. Organizers manage their lineup, vendor applications, on-site check-in, and refund
          requests from a single dashboard.
        </p>
        <h3>Who this guide is for</h3>
        <ul>
          <li><strong>Attendees</strong> — anyone buying tickets or registering for an event.</li>
          <li><strong>Organizers</strong> — the people who host events and run organizations.</li>
          <li><strong>Vendors</strong> — businesses that apply for booth space at an event.</li>
          <li><strong>Staff / Volunteers</strong> — team members helping with day-of check-in.</li>
          <li><strong>Platform admins (SUPERADMIN)</strong> — the YourEvents staff who oversee the whole platform.</li>
        </ul>
        <h3>Key benefits</h3>
        <ul>
          <li>Flat pricing — 5% platform fee with a $1.25 minimum, no surprise buyer fees.</li>
          <li>Payouts through your own Stripe account — new organizers&rsquo; funds are protected until the day after each event (buyer protection), and established organizers earn fast daily payouts.</li>
          <li>Branded event pages with QR-coded tickets and instant refund handling.</li>
          <li>Vendor application and booth-payment flow built in — no separate system needed.</li>
        </ul>
        <h3>Scope of this guide</h3>
        <p>
          Every workflow available in the live application. If a feature exists in the app, you can
          find its how-to here. For platform technical detail (architecture, API, deployment), see
          the internal <code>docs/</code> folder in the repository.
        </p>

        <h2>2. Getting started</h2>
        <h3>System requirements</h3>
        <ul>
          <li>Any device with a modern web browser — desktop, tablet, or phone.</li>
          <li>Internet connection for registration, payment, and check-in.</li>
          <li>Email account that can receive transactional mail from <code>events@yourevents.app</code>.</li>
        </ul>
        <h3>Supported browsers</h3>
        <p>Chrome, Edge, Firefox, and Safari (current and prior major version). Mobile Safari and Chrome on Android are fully supported, including the check-in QR scanner.</p>
        <h3>Prerequisites</h3>
        <ul>
          <li><strong>Attendees:</strong> nothing — you don&rsquo;t need an account to register for an event. An account is created automatically if you want one.</li>
          <li><strong>Organizers:</strong> a valid email address, a working phone number, your organization&rsquo;s mailing address, and a US bank account (for Stripe payouts).</li>
          <li><strong>Vendors:</strong> business name, contact info, mailing address, and a description of what you sell.</li>
          <li><strong>Staff:</strong> an invitation email from the organizer.</li>
        </ul>
        <h3>Account creation</h3>
        <ol>
          <li>Go to <code>yourevents.app/signup</code>.</li>
          <li>Fill in your first name, last name, email, phone, and a password (at least 8 characters).</li>
          <li>Enter your organization name and a short URL slug (this becomes <code>yourevents.app/o/your-slug</code>).</li>
          <li>Fill in the mailing address — required for billing receipts and account verification. Start typing the street address and Google&rsquo;s autocomplete will fill in city/state/zip/country.</li>
          <li>Click <strong>Create account &rarr; pick a plan</strong>.</li>
        </ol>
        <p>
          <strong>Expected result:</strong> you are signed in and land on the billing page. The free
          tier is activated by default — you can pick a paid plan later.
        </p>
        <h3>Login process</h3>
        <ol>
          <li>Go to <code>yourevents.app/signin</code>.</li>
          <li>Enter your email and password.</li>
          <li>If you have two-factor authentication enabled, enter the 6-digit code from your authenticator app.</li>
          <li>Click <strong>Sign in</strong>.</li>
        </ol>
        <p><strong>Tip:</strong> attendees can also sign in by email link only (no password) — use the <strong>Email me a sign-in link</strong> option.</p>
        <h3>Password reset</h3>
        <ol>
          <li>From the sign-in page, click <strong>Forgot password</strong>.</li>
          <li>Enter your email and click <strong>Send reset link</strong>.</li>
          <li>Check your inbox for an email from <code>events@yourevents.app</code> and click the reset link inside (valid for 30 minutes).</li>
          <li>Enter a new password twice and click <strong>Reset password</strong>.</li>
        </ol>
        <h3>First-time setup (organizers)</h3>
        <ol>
          <li>After signup, visit <strong>Settings</strong> &rarr; add a logo, tagline, brand color, contact phone, and mailing address.</li>
          <li>Visit <strong>Billing</strong> &rarr; pick the Free tier (or a paid plan if you need more capacity).</li>
          <li>Visit <strong>Settings</strong> &rarr; <strong>Payouts (Stripe Connect)</strong> &rarr; click <strong>Connect Stripe</strong>. Complete the Stripe Express onboarding (5-10 minutes; Stripe verifies your identity and bank account).</li>
          <li>You&rsquo;re ready to create your first event.</li>
        </ol>

        <h2>3. Application overview</h2>
        <h3>High-level workflow</h3>
        <p>
          Most events follow the same arc: an organizer creates an event, attendees register and
          pay, optional vendors apply for booths and pay separately, the team scans QR tickets at
          the door on event day, and Stripe pays the organizer out shortly after. Refunds, waitlists,
          and email broadcasts run from the same dashboard.
        </p>
        <h3>User roles and permissions</h3>
        <p>Every account has a single role. The role controls what you see in the app:</p>
        <ul>
          <li><strong>ATTENDEE</strong> — register for events, view their own tickets, request refunds. No dashboard access.</li>
          <li><strong>ORGANIZER</strong> — create and manage events, invite team members, edit other team members&rsquo; info, view financials.</li>
          <li><strong>ADMIN</strong> — same as Organizer, plus org-wide settings (rarely used; most orgs just have organizers).</li>
          <li><strong>STAFF</strong> — check-in only. Can scan QR codes for events they&rsquo;re assigned to.</li>
          <li><strong>VOLUNTEER</strong> — same as Staff. Separate label so organizers can distinguish paid vs unpaid helpers.</li>
          <li><strong>SUPERADMIN</strong> — platform staff. Sees every organization, vendor, attendee on the platform.</li>
        </ul>
        <h3>Navigation overview</h3>
        <ul>
          <li><strong>Top nav</strong> — the main sections you can access for your role. Organizers see Dashboard, Financials, Billing, Audit log, Settings.</li>
          <li><strong>Breadcrumb header</strong> — on detail pages, the breadcrumb shows where you are and lets you jump back.</li>
          <li><strong>Footer</strong> — links to How it works, Pricing, vs Eventbrite, Help, Contact, Status, About, Security, Terms, Privacy.</li>
        </ul>
        <h3>Dashboard explanation</h3>
        <p>
          The <strong>Organizer Dashboard</strong> at <code>/dashboard</code> shows your upcoming
          events, ticket sales summary, and a list of recent registrations. Each event has its own
          management page with tabs for registrations, vendors, refund requests, promo codes,
          campaigns, waitlist, audit log, and financials.
        </p>
        <p>
          The <strong>Attendee Account</strong> at <code>/account</code> shows your registered
          events, waitlist entries, refund requests, and profile page.
        </p>
        <p>
          The <strong>Platform Admin</strong> area at <code>/admin</code> (SUPERADMIN only) has
          quick-action cards for Organizers, Vendors, Attendees, plus Financials, Audit log, and
          maintenance-mode toggle.
        </p>

        <h2>4. Attendee guide</h2>
        <p>This section covers everything an attendee can do — finding events, registering, paying, and managing your account.</p>

        <h3>How to find an event</h3>
        <ol>
          <li>Go to <code>yourevents.app</code>.</li>
          <li>Use the search box on the homepage to find events by name, category, city, or organizer.</li>
          <li>Or, if an organizer sent you a direct link (e.g. <code>yourevents.app/o/summer-fest/events/main-event</code>), click that to go straight to the event page.</li>
        </ol>

        <h3>How to sign up for an event (free)</h3>
        <ol>
          <li>On the event page, click <strong>Register</strong>.</li>
          <li>Select the ticket type and quantity.</li>
          <li>Fill in your name, email, phone, and (optionally) company and mailing address.</li>
          <li>Answer any custom questions the organizer added.</li>
          <li>Click <strong>Complete registration</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> a confirmation page shows your tickets, and a confirmation email with QR codes attached arrives within a minute.</p>

        <h3>How to pay for an event (paid ticket)</h3>
        <ol>
          <li>On the event page, click <strong>Register</strong>.</li>
          <li>Select the ticket type and quantity. The order summary shows subtotal, any discount, tax, and total.</li>
          <li>Fill in your name, email, phone, and address.</li>
          <li>If you have a promo code, enter it in the <strong>Promo code</strong> field — the discount appears in the order summary if valid.</li>
          <li>Click <strong>Pay &amp; register</strong>. You&rsquo;ll be redirected to Stripe&rsquo;s secure checkout.</li>
          <li>Enter your card details (or use Apple Pay / Google Pay / Link if offered) and click <strong>Pay</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> Stripe redirects you back to YourEvents, your tickets are issued, and the confirmation email arrives within a minute.</p>
        <p><strong>Common mistakes to avoid:</strong> don&rsquo;t close the Stripe tab before payment completes. If your card is declined, you&rsquo;ll see the error inline and can retry without losing your form input.</p>

        <h3>How to receive your tickets by email</h3>
        <ol>
          <li>Tickets are emailed automatically the moment your registration confirms.</li>
          <li>Check your inbox for an email from <code>events@yourevents.app</code> with the subject <em>You&rsquo;re registered: [event name]</em>.</li>
          <li>QR codes are embedded directly in the email body, so they survive being printed or forwarded.</li>
          <li>Each ticket admits one person. If you bought multiple tickets, each one has its own unique QR code.</li>
        </ol>
        <p><strong>Tip:</strong> if the email hasn&rsquo;t arrived within five minutes, check your spam/junk folder. Add <code>events@yourevents.app</code> to your contacts so future event emails always land in your inbox.</p>

        <h3>How to access your account</h3>
        <ol>
          <li>Go to <code>yourevents.app/account/signin</code>.</li>
          <li>Enter your email and click <strong>Email me a sign-in link</strong>.</li>
          <li>Check your inbox and click the link in the email (valid for 15 minutes).</li>
          <li>You&rsquo;ll land on your account dashboard.</li>
        </ol>

        <h3>How to view your registered events</h3>
        <ol>
          <li>Sign in to your account at <code>yourevents.app/account</code>.</li>
          <li>The <strong>My Events</strong> tab lists every event you&rsquo;ve registered for, with upcoming events at the top.</li>
          <li>Click any event to see the full ticket details and the QR code.</li>
        </ol>

        <h3>How to update your profile</h3>
        <ol>
          <li>From your account dashboard, click <strong>Profile</strong>.</li>
          <li>Edit your first name, last name, phone, or change your password.</li>
          <li>Click <strong>Save changes</strong>.</li>
        </ol>
        <p>The new name and contact info will be used on future registrations automatically.</p>

        <h3>How to request a refund</h3>
        <ol>
          <li>Sign in to your account.</li>
          <li>Open the <strong>My Events</strong> tab and click the event you want a refund for.</li>
          <li>Click <strong>Request refund</strong>.</li>
          <li>Type a reason (at least 10 characters) so the organizer understands your situation.</li>
          <li>Click <strong>Submit refund request</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> you&rsquo;ll see a confirmation that the request was submitted, and the organizer is notified by email. You&rsquo;ll get an email when they approve or decline.</p>
        <p><strong>Note:</strong> the 5% platform fee is non-refundable per the event&rsquo;s refund policy. If the organizer approves the refund, you&rsquo;ll receive your ticket price minus that fee, returned to your original payment method within 5-10 business days.</p>

        <h3>How to join a waitlist</h3>
        <ol>
          <li>If an event is sold out, the registration page shows a <strong>Join the waitlist</strong> button.</li>
          <li>Click it and enter your name, email, and phone.</li>
          <li>Click <strong>Add me to the waitlist</strong>.</li>
        </ol>
        <p>
          <strong>What happens next:</strong> if a registered attendee cancels, the next person on
          the waitlist gets an email with a magic link to register. You have ~24 hours to claim the
          spot before it&rsquo;s offered to the next person.
        </p>

        <h3>How to leave a waitlist</h3>
        <ol>
          <li>Open the waitlist confirmation email you received when you joined.</li>
          <li>Click the <strong>Leave waitlist</strong> link at the bottom of the email.</li>
          <li>Confirm on the page that opens.</li>
        </ol>

        <h2>5. Organizer guide</h2>
        <p>This section covers everything an organizer does — setting up your account, creating events, managing registrations, vendors, refunds, and your team.</p>

        <h3>How to set up your organization profile</h3>
        <ol>
          <li>From the dashboard, click <strong>Settings</strong>.</li>
          <li>Update the organization name, tagline, and about description. These appear on your public page at <code>yourevents.app/o/your-slug</code>.</li>
          <li>Upload a logo URL and choose a brand color (hex value like <code>#1F3A8A</code>). The brand color is used for buttons and accents on your public pages.</li>
          <li>Fill in contact email, phone, and mailing address. All required.</li>
          <li>Click <strong>Save settings</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> a green confirmation popup appears in the center of the screen, and your changes are live on the public org page immediately.</p>

        <h3>How to connect Stripe to get paid</h3>
        <ol>
          <li>From <strong>Settings</strong>, scroll to the <strong>Payouts (Stripe Connect)</strong> section.</li>
          <li>Click <strong>Connect Stripe</strong>. You&rsquo;ll be redirected to Stripe&rsquo;s Express onboarding.</li>
          <li>Enter your business details — Stripe verifies your identity (driver&rsquo;s license or passport) and bank account routing/account number.</li>
          <li>When complete, you&rsquo;re redirected back to YourEvents settings.</li>
        </ol>
        <p><strong>Expected result:</strong> the Payouts section shows <strong>enabled</strong> in green. You can now create paid events.</p>
        <p><strong>Tip:</strong> the verification takes 5-10 minutes typically. If Stripe needs additional info, they&rsquo;ll email you directly.</p>

        <h3>How to create your first event</h3>
        <ol>
          <li>From the dashboard, click <strong>+ New Event</strong>.</li>
          <li>Pick a tier: <strong>Free</strong> (up to 50 attendees, basic features) or <strong>Single Event</strong> ($19, unlimited registrations + vendor flow + branding).</li>
          <li>Enter the event name, short description, and full description.</li>
          <li>Pick start and end date/time and a timezone.</li>
          <li>Fill in the venue address — autocomplete fills city/state/zip. Or check <strong>Virtual event</strong> and paste a Zoom/Meet URL.</li>
          <li>Add at least one ticket type (e.g. General Admission, free or with a price).</li>
          <li>Optionally add a banner image and event tags.</li>
          <li>Click <strong>Save as draft</strong> or <strong>Save and publish</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> you land on the event management page where you can add more ticket types, set up promo codes, etc.</p>

        <h3>How to add ticket types</h3>
        <ol>
          <li>Open the event management page.</li>
          <li>In the <strong>Ticket types</strong> section, click <strong>+ Add ticket type</strong>.</li>
          <li>Enter the name (e.g. &ldquo;Early Bird&rdquo;, &ldquo;VIP&rdquo;), price, and total quantity available.</li>
          <li>Optionally set a sales start/end date if the tier is time-limited.</li>
          <li>Click <strong>Add ticket type</strong>.</li>
        </ol>
        <p>You can add as many tiers as you want. Free tickets can coexist with paid ones.</p>

        <h3>How to add promo codes</h3>
        <ol>
          <li>Open the event management page and click <strong>Promo codes</strong>.</li>
          <li>Click <strong>+ Add promo code</strong>.</li>
          <li>Enter the code (e.g. <code>SUMMER10</code>), discount type (percentage or fixed dollar amount), and discount value.</li>
          <li>Optionally set a usage limit (e.g. first 50 uses) and expiration date.</li>
          <li>Click <strong>Save</strong>.</li>
        </ol>
        <p><strong>Tip:</strong> share the code in your marketing emails. Attendees enter it at checkout.</p>

        <h3>How to set up an early-bird presale discount</h3>
        <ol>
          <li>Open the event management page and scroll to <strong>Presale discount</strong>.</li>
          <li>Check <strong>Enable presale</strong>.</li>
          <li>Enter the discount percentage (e.g. 20 for 20%) and the date/time the presale ends.</li>
          <li>Click <strong>Save presale settings</strong>.</li>
        </ol>
        <p>The discount is automatically applied to every paid ticket purchased before the deadline. Attendees see the strikethrough price on the event page.</p>

        <h3>How to add custom registration questions</h3>
        <ol>
          <li>Open the event management page and click <strong>Custom questions</strong>.</li>
          <li>Click <strong>+ Add question</strong>.</li>
          <li>Pick a question type: text, long text, dropdown, radio, checkbox, email, phone, or number.</li>
          <li>Enter the question label and (if applicable) the answer options.</li>
          <li>Check <strong>Required</strong> if it must be answered.</li>
          <li>Click <strong>Save</strong>.</li>
        </ol>
        <p>The question appears in step 3 of the attendee registration form. Answers are stored on each registration and included in CSV exports.</p>

        <h3>How to add a banner image (and reframe it)</h3>
        <ol>
          <li>Open the event management page and scroll to <strong>Banner image</strong>.</li>
          <li>Click <strong>Choose image</strong> and pick a wide image (16:6 aspect ratio looks best).</li>
          <li>The image uploads to Cloudinary. Once it&rsquo;s done, a preview appears.</li>
          <li>Drag inside the preview frame to reposition the image. Use the zoom slider to scale it.</li>
          <li>Check <strong>Fit entire image to frame</strong> if you want the whole image visible with letterbox space (instead of cropping).</li>
          <li>Click <strong>Save changes</strong>.</li>
        </ol>
        <p>The preview frame on the editor matches the public event page exactly — what you see is what attendees see.</p>

        <h3>How to enable waitlist</h3>
        <ol>
          <li>Open the event management page.</li>
          <li>In the event basics section, check <strong>Enable waitlist when sold out</strong>.</li>
          <li>Click <strong>Save changes</strong>.</li>
        </ol>
        <p>When all ticket types reach their capacity, the registration page automatically shows a Join waitlist button instead.</p>

        <h3>How to enable vendor applications</h3>
        <ol>
          <li>Open the event management page.</li>
          <li>Check <strong>Accept vendor applications</strong>.</li>
          <li>(Optional) Enter vendor application notes — these appear on the vendor form (e.g. &ldquo;Booths are 10x10 with table and chairs. Load-in 7am day of event&rdquo;).</li>
          <li>Enter the default vendor booth price. This pre-fills when you approve each vendor; you can override per-vendor at approval time. Leave at $0 if you&rsquo;ll quote each vendor individually.</li>
          <li>Click <strong>Save changes</strong>.</li>
        </ol>
        <p>The public event page now shows a <strong>Become a Vendor</strong> button.</p>

        <h3>How to review and approve a vendor application</h3>
        <ol>
          <li>When a vendor submits an application, every organizer and admin in your org gets a notification email titled &ldquo;New vendor application — [event name]&rdquo;.</li>
          <li>Click <strong>Review vendor application</strong> in the email, or go to the event management page and click <strong>Vendors</strong>.</li>
          <li>The application card shows the company name, contact, email, phone, mailing address, product category, booth preference, and description.</li>
          <li>Click <strong>Approve</strong>, optionally adjust the quoted booth price, and add approval notes if you want to.</li>
          <li>Click <strong>Send payment link</strong>. A secure Stripe checkout link is emailed to the vendor automatically.</li>
        </ol>
        <p><strong>Expected result:</strong> the vendor receives an approval email with a one-click payment link. Once they pay, they become a confirmed vendor with the same QR-ticketed credentials as attendees.</p>

        <h3>How to publish your event</h3>
        <ol>
          <li>Open the event management page.</li>
          <li>Make sure you have at least one ticket type added.</li>
          <li>Click <strong>Publish</strong> in the top-right.</li>
        </ol>
        <p>The event is now public at <code>yourevents.app/o/your-org/events/your-event-slug</code>. The status changes from DRAFT to PUBLISHED.</p>

        <h3>How to share your event</h3>
        <ul>
          <li>Copy the public URL from the top of the event management page and share by email, Slack, Facebook, etc.</li>
          <li>The metadata is set up so when you paste the link into iMessage, Slack, LinkedIn, etc., a preview card with the banner image appears.</li>
        </ul>

        <h3>How to view and manage registrations</h3>
        <ol>
          <li>Open the event management page and click <strong>Registrations</strong>.</li>
          <li>Each row shows the attendee name, email, ticket type, quantity, total paid, and status.</li>
          <li>Use the filter dropdown to narrow to a single status (CONFIRMED, PENDING, REFUNDED).</li>
          <li>Click <strong>Export CSV</strong> to download the full list.</li>
        </ol>

        <h3>How to issue a refund</h3>
        <ol>
          <li>On the <strong>Registrations</strong> page, find the attendee.</li>
          <li>Click <strong>Refund</strong> in their row.</li>
          <li>Confirm the dialog. The attendee&rsquo;s ticket price minus the 5% platform fee is returned to their original payment method.</li>
        </ol>
        <p><strong>Tip:</strong> to refund multiple attendees at once, check the boxes next to each row and click <strong>Refund selected (minus 5%)</strong>.</p>

        <h3>How to send an email broadcast</h3>
        <ol>
          <li>Open the event management page and click <strong>Campaigns</strong>.</li>
          <li>Click <strong>+ New campaign</strong>.</li>
          <li>Enter a subject and email body (HTML supported).</li>
          <li>Pick the audience: all confirmed attendees, or filter by status / ticket type.</li>
          <li>Click <strong>Send now</strong>.</li>
        </ol>
        <p><strong>Note:</strong> the number of campaigns you can send per event is capped by your plan. Free events: 1 campaign. Single-event: 5 campaigns. See <code>/dashboard/billing</code> for current limits.</p>

        <h3>How to do on-site check-in</h3>
        <ol>
          <li>On event day, go to <code>yourevents.app/checkin/[event-id]</code> on your phone or any device with a camera.</li>
          <li>Allow camera access when prompted.</li>
          <li>Point the camera at the attendee&rsquo;s QR code. The scanner reads it automatically.</li>
          <li>A green checkmark confirms a valid first-time check-in. A red warning means the ticket was already scanned or is invalid.</li>
        </ol>
        <p><strong>Manual check-in:</strong> if a QR scan fails, click <strong>Search attendees</strong>, find them by name or email, and click <strong>Check in</strong>.</p>

        <h3>How to view financials</h3>
        <ol>
          <li>From the dashboard, click <strong>Financials</strong>.</li>
          <li>Pick a time range: Last hour, day, week, month, year, or all-time.</li>
          <li>The page shows gross revenue, refunds, platform fees, net payout, and a trend chart.</li>
          <li>Click <strong>Export CSV</strong> for a per-event breakdown.</li>
        </ol>

        <h3>How to invite a team member</h3>
        <ol>
          <li>From the dashboard, click <strong>Team</strong>.</li>
          <li>Click <strong>+ Invite team member</strong>.</li>
          <li>Enter their email, name, and pick a role: Organizer, Staff, or Volunteer.</li>
          <li>(Optional) write a role description and a personal message.</li>
          <li>Click <strong>Send invite</strong>.</li>
        </ol>
        <p>They receive an email with a link to set up their account. Pending invites appear on the Team page with options to resend or revoke.</p>

        <h3>How to edit a team member&rsquo;s info</h3>
        <ol>
          <li>From the Team page, click <strong>Edit</strong> next to the member&rsquo;s name.</li>
          <li>Update their first name, last name, email, phone, mailing address, or role.</li>
          <li>Click <strong>Save changes</strong>.</li>
        </ol>
        <p><strong>Note:</strong> only ORGANIZER role users can edit other team members. You can&rsquo;t change your own role; another organizer has to do that for you.</p>

        <h3>How to set up two-factor authentication</h3>
        <ol>
          <li>From the dashboard, click <strong>Settings</strong>.</li>
          <li>Scroll to <strong>Two-factor authentication</strong>.</li>
          <li>Click <strong>Enable two-factor</strong>.</li>
          <li>Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy, etc.).</li>
          <li>Enter the 6-digit code to verify and click <strong>Confirm</strong>.</li>
          <li>Save the recovery codes shown — you&rsquo;ll need one if you lose your phone.</li>
        </ol>

        <h2>6. Vendor guide</h2>
        <p>This section covers everything a vendor does — finding events, applying, and paying for your booth.</p>

        <h3>How to find a vendor application</h3>
        <ol>
          <li>The organizer will share a direct link, or you can find their public event page at <code>yourevents.app/o/their-org/events/event-name</code>.</li>
          <li>On the event page, look for a <strong>Become a Vendor</strong> button.</li>
          <li>Click it to open the vendor application form.</li>
        </ol>

        <h3>How to fill out a vendor application</h3>
        <ol>
          <li>Enter your company name and contact info (first name, last name, email, phone).</li>
          <li>Add your website (optional) and logo URL (optional).</li>
          <li>Fill in your mailing address — autocomplete fills city/state/zip.</li>
          <li>Pick a product category from the dropdown (e.g. Food &amp; Beverage, Arts &amp; Crafts).</li>
          <li>Describe what you&rsquo;ll offer (minimum 10 characters).</li>
          <li>(Optional) note a booth size preference.</li>
          <li>(Optional) add any additional requests or special notes.</li>
          <li>Click <strong>Submit application</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> a confirmation page appears. The organizer is notified by email immediately.</p>

        <h3>What happens after you submit</h3>
        <ol>
          <li>The organizer reviews your application — typically within a few days.</li>
          <li>If approved, you receive an email with the quoted booth price and a secure payment link.</li>
          <li>If declined, you receive an email letting you know.</li>
          <li>If they need more info, they&rsquo;ll reply directly to your application email.</li>
        </ol>

        <h3>How to pay for your booth</h3>
        <ol>
          <li>Open the approval email and click <strong>Pay for your booth</strong>.</li>
          <li>The page shows your booth fee and event details.</li>
          <li>Click <strong>Pay now</strong> to open Stripe&rsquo;s secure checkout.</li>
          <li>Enter your card details and click <strong>Pay</strong>.</li>
        </ol>
        <p><strong>Expected result:</strong> Stripe redirects you back, your status changes to PAID, and you receive a vendor pass email with a QR code. Show the QR at vendor load-in on event day.</p>

        <h3>How to update or withdraw your application</h3>
        <p>
          You can&rsquo;t edit your application after submitting. If you need to change details (booth size, what you&rsquo;re selling, contact info), email the organizer directly. To withdraw,
          contact the organizer and they&rsquo;ll mark your application as WITHDRAWN.
        </p>

        <h2>7. Staff and volunteer guide</h2>
        <p>This section covers how a team member helps with day-of check-in.</p>

        <h3>How to accept your invitation</h3>
        <ol>
          <li>Open the invitation email from <code>events@yourevents.app</code>.</li>
          <li>Click <strong>Accept invitation</strong>.</li>
          <li>Set a password and click <strong>Create my account</strong>.</li>
        </ol>
        <p>You&rsquo;re now signed in. Staff and volunteer accounts can only access the check-in scanner, not the dashboard.</p>

        <h3>How to access the check-in scanner</h3>
        <ol>
          <li>Sign in at <code>yourevents.app/signin</code>.</li>
          <li>You land on the check-in event picker, showing every event you&rsquo;re assigned to.</li>
          <li>Tap the event you&rsquo;re working.</li>
          <li>The scanner opens. Allow camera access when prompted.</li>
        </ol>

        <h3>How to scan attendee QR codes</h3>
        <ol>
          <li>Hold your phone (or any device with a camera) up to the attendee&rsquo;s QR code — printed or shown on their phone.</li>
          <li>The scanner reads it automatically. Green = valid check-in. Red = duplicate scan or invalid ticket.</li>
          <li>Continue scanning the next attendee.</li>
        </ol>

        <h3>How to manually check in someone whose QR won&rsquo;t scan</h3>
        <ol>
          <li>Tap <strong>Search attendees</strong> in the scanner UI.</li>
          <li>Type the attendee&rsquo;s name or email.</li>
          <li>Tap their name in the results, then tap <strong>Check in</strong>.</li>
        </ol>

        <h3>What you can and can&rsquo;t see</h3>
        <ul>
          <li><strong>Can see:</strong> the events you&rsquo;re assigned to, attendee names for check-in, real-time arrival counts.</li>
          <li><strong>Can&rsquo;t see:</strong> the organizer dashboard, financials, billing, refund requests, vendor management, settings.</li>
        </ul>

        <h2>8. Platform admin guide (SUPERADMIN)</h2>
        <p>This section is for YourEvents staff who oversee the whole platform.</p>

        <h3>How to access the platform admin area</h3>
        <ol>
          <li>Sign in with your SUPERADMIN account.</li>
          <li>From the dashboard, click <strong>Platform Admin</strong> in the top nav (or go to <code>/admin</code> directly).</li>
        </ol>

        <h3>How to invite a new organization</h3>
        <ol>
          <li>From the admin overview, click <strong>+ Invite organization</strong>.</li>
          <li>Enter the organization name, slug, and the contact person&rsquo;s email.</li>
          <li>Click <strong>Send invite</strong>. The contact receives an email to set up their account.</li>
        </ol>

        <h3>How to browse all organizers</h3>
        <ol>
          <li>From the admin overview, click <strong>All organizers</strong>.</li>
          <li>Use the filters to narrow by plan, subscription status, or Stripe Connect status.</li>
          <li>Click <strong>Export CSV</strong> to download.</li>
        </ol>

        <h3>How to browse all vendors</h3>
        <ol>
          <li>From the admin overview, click <strong>All vendors</strong>.</li>
          <li>Use the filters to narrow by org, event, status, or product category.</li>
          <li>Click <strong>Edit</strong> on any row to modify vendor company / contact / address / booth details.</li>
          <li>Click <strong>Export CSV</strong> to download.</li>
        </ol>

        <h3>How to browse all attendees</h3>
        <ol>
          <li>From the admin overview, click <strong>All attendees</strong>.</li>
          <li>Filter by date range, org, event, or status.</li>
          <li>Click <strong>Export CSV</strong> for a full report.</li>
        </ol>

        <h3>How to view platform financials</h3>
        <ol>
          <li>From admin nav, click <strong>Financials</strong>.</li>
          <li>Pick a time range. The page shows platform fee revenue, subscription revenue, GMV, take rate, and a trend chart.</li>
        </ol>

        <h3>How to review the audit log</h3>
        <ol>
          <li>From admin nav, click <strong>Audit log</strong>.</li>
          <li>Filter by org, action type, or text search.</li>
          <li>Every significant action (publish, refund, role change) is recorded with who, what, when, and metadata.</li>
        </ol>

        <h3>How to enable maintenance mode</h3>
        <ol>
          <li>From the admin overview, scroll to <strong>Maintenance mode</strong>.</li>
          <li>Click <strong>Enable maintenance</strong>.</li>
          <li>Optionally set an end time and a custom message.</li>
          <li>Click <strong>Save</strong>.</li>
        </ol>
        <p>Non-SUPERADMIN users see a maintenance page until you disable it. SUPERADMINs continue to have full access during maintenance.</p>

        <h2>9. User roles and permissions matrix</h2>
        <p>Compare what each role can do:</p>
        <div className="not-prose overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Function</th>
                <th className="px-4 py-3 text-center">Attendee</th>
                <th className="px-4 py-3 text-center">Staff / Volunteer</th>
                <th className="px-4 py-3 text-center">Organizer / Admin</th>
                <th className="px-4 py-3 text-center">SUPERADMIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["Register for events", "Yes", "Yes", "Yes", "Yes"],
                ["View own tickets", "Yes", "Yes", "Yes", "Yes"],
                ["Request refunds", "Yes", "Yes", "Yes", "Yes"],
                ["Check in attendees", "No", "Yes (assigned events)", "Yes", "Yes"],
                ["Create events", "No", "No", "Yes", "Yes"],
                ["Manage vendors", "No", "No", "Yes", "Yes"],
                ["View financials", "No", "No", "Yes (own org)", "Yes (platform)"],
                ["Invite team members", "No", "No", "Yes", "Yes"],
                ["Edit other team members", "No", "No", "Organizer only", "Yes"],
                ["Issue refunds", "No", "No", "Yes (own org)", "Yes"],
                ["Send email broadcasts", "No", "No", "Yes", "Yes"],
                ["Browse all platform data", "No", "No", "No", "Yes"],
                ["Toggle maintenance mode", "No", "No", "No", "Yes"],
              ].map(([fn, ...rest]) => (
                <tr key={fn}>
                  <td className="px-4 py-3 font-medium">{fn}</td>
                  {rest.map((cell, i) => (
                    <td key={i} className={`px-4 py-3 text-center ${cell === "No" ? "text-slate-400" : "text-emerald-700"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>10. Notifications and alerts</h2>
        <p>Most YourEvents notifications arrive by email. Some are also surfaced in the dashboard.</p>
        <h3>System notifications</h3>
        <ul>
          <li><strong>Registration confirmation</strong> — sent to the attendee with QR-coded tickets attached.</li>
          <li><strong>Reminder emails</strong> — 30 days, 7 days, 1 day, and 1 hour before the event.</li>
          <li><strong>Waitlist promotion</strong> — when a spot opens up, sent to the next person on the list.</li>
          <li><strong>Refund-request received</strong> — sent to the organizer when an attendee requests a refund.</li>
          <li><strong>Refund decision</strong> — sent to the attendee when the organizer approves or declines.</li>
          <li><strong>New vendor application</strong> — sent to every organizer and admin in the org.</li>
          <li><strong>Vendor approval</strong> — sent to the vendor with their payment link.</li>
        </ul>
        <h3>Warning messages</h3>
        <p>Amber banners appear in the dashboard when something needs your attention:</p>
        <ul>
          <li>&ldquo;Please add your mailing address to complete your organization profile.&rdquo;</li>
          <li>&ldquo;Connect Stripe to accept paid registrations.&rdquo;</li>
          <li>&ldquo;Your subscription is past due — update your payment method.&rdquo;</li>
        </ul>
        <h3>Error messages</h3>
        <p>Red banners appear when an action fails:</p>
        <ul>
          <li>&ldquo;End time must be after the start time.&rdquo;</li>
          <li>&ldquo;That email is already in use by another account.&rdquo;</li>
          <li>&ldquo;You can&rsquo;t demote the last organizer. Promote someone else first.&rdquo;</li>
        </ul>
        <h3>Confirmation messages</h3>
        <p>Green popup toasts appear in the center of the screen for any successful save:</p>
        <ul>
          <li>&ldquo;Saved&rdquo; (auto-dismisses after ~1.6s).</li>
          <li>&ldquo;Updated [name].&rdquo;</li>
          <li>&ldquo;Invite sent to [email].&rdquo;</li>
        </ul>

        <h2>11. Troubleshooting guide</h2>
        <div className="not-prose overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Problem</th>
                <th className="px-4 py-3">Possible cause</th>
                <th className="px-4 py-3">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["I can't sign in", "Wrong password or email", "Use Forgot password on the sign-in page to reset."],
                ["Confirmation email never arrived", "Email landed in spam or invalid address typed", "Check spam, then sign in to your account and view tickets there. Add events@yourevents.app to your contacts."],
                ["QR code on phone won't scan at the door", "Glare on the screen, low brightness, cracked screen", "Crank screen brightness all the way up. If still failing, organizer can search by name and check in manually."],
                ["Stripe Connect onboarding is stuck", "Stripe is reviewing your account or needs additional info", "Check your email for a Stripe message. Re-open the onboarding link from Settings to fill any new fields."],
                ["My event won't publish", "No ticket type added", "Add at least one ticket type, then try publishing again."],
                ["Promo code says invalid", "Code expired, hit usage limit, or wrong code entered", "Confirm the code with the organizer and check the expiration."],
                ["Payment was declined", "Card issuer flagged the charge", "Try a different card, or contact your bank to authorize the transaction."],
                ["Vendor application form won't submit", "A required field is blank (phone, address, product category)", "Look for red error text under any field. All addresses must be complete."],
                ["My account page won't load", "Session expired", "Sign in again."],
                ["I'm an organizer but can't see Financials", "Your role is STAFF or VOLUNTEER, not ORGANIZER", "Have an organizer in your org edit your role on /dashboard/team."],
                ["Refund request is stuck on OPEN", "Organizer hasn't reviewed it yet", "Refund requests are reviewed by the organizer, not the platform. Contact the organizer directly."],
                ["Address autocomplete isn't showing suggestions", "Google Maps API key issue, ad-blocker, or network problem", "Type your address manually. The other fields still work without autocomplete."],
              ].map(([p, c, r]) => (
                <tr key={p}>
                  <td className="px-4 py-3 font-medium">{p}</td>
                  <td className="px-4 py-3 text-slate-600">{c}</td>
                  <td className="px-4 py-3 text-slate-700">{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>12. Frequently asked questions</h2>
        {[
          { q: "Do I need an account to register for an event?", a: "No. You can register as a guest. An attendee account is created automatically if you want one, so you can view your tickets later by signing in with a magic link." },
          { q: "How much does YourEvents cost?", a: "Hosting free events is free. Paid events have a 5% platform fee with a $1.25 minimum per paid ticket. Vendor booth payments use the same fee." },
          { q: "When do I get paid as an organizer?", a: "New organizers: your funds are held for buyer protection and released to your Stripe-linked bank account the day after your event ends. After five successful events (or earlier on request), you graduate to fast daily payouts." },
          { q: "Why is there a minimum platform fee?", a: "Stripe's processing cost (2.9% + $0.30) eats more than 5% on tickets under $25. The $1.25 floor keeps the platform net-positive on every paid ticket." },
          { q: "Can I sell tickets in person at the door?", a: "Yes — log in on a phone and use the registration form to add walk-ups. They'll get tickets emailed immediately and the QR scans the same as online registrations." },
          { q: "What if I forgot my password?", a: "Click Forgot password on the sign-in page. You'll get a reset link by email valid for 30 minutes." },
          { q: "How do I cancel my event?", a: "From the event management page, click Unpublish to take it offline temporarily, or Delete event under Danger zone to soft-delete it. Existing registrations remain visible for record-keeping." },
          { q: "Can I refund just part of a registration?", a: "Refunds are full-ticket only (minus the 5% platform fee). To partially refund, contact us directly." },
          { q: "What happens to the platform fee on a refund?", a: "The 5% platform fee is non-refundable per the event's refund policy. The attendee receives their ticket price minus the fee." },
          { q: "Can vendors get refunded?", a: "Yes. From the Vendors page on your event management dashboard, click Refund vendor. The booth payment minus the 5% platform fee is returned. Their vendor pass is invalidated." },
          { q: "How do I change my organization's URL?", a: "The URL slug (e.g. yourevents.app/o/your-slug) can only be changed by a platform admin to prevent broken links. Email support to request the change." },
          { q: "Can attendees buy more than one ticket?", a: "Yes. Most events allow up to 10 tickets per order by default. Organizers can lower this on a per-event basis." },
          { q: "Does YourEvents charge attendees any extra fees?", a: "No. The price you set is the price the attendee pays. We charge the organizer; we never tack a service fee onto the buyer's checkout." },
          { q: "What's the difference between Organizer, Admin, Staff, and Volunteer?", a: "Organizers and Admins manage the org (create events, see financials, invite team). Staff and Volunteers handle on-site check-in only. Staff vs. Volunteer is just a label for paid vs. unpaid helpers." },
          { q: "How many events can I create on the Free plan?", a: "One event per month, up to 50 registrations per event. Upgrade to a Single Event credit ($19) to lift the cap and unlock vendor flow and unlimited registrations." },
          { q: "Do I have to use Stripe to get paid?", a: "Yes. Stripe Connect is the only payout method. They handle KYC and tax reporting, and your funds sit in your own Stripe account until they're paid out to your bank." },
          { q: "Can I export my attendee list?", a: "Yes. From the Registrations page on your event, click Export CSV. The download includes every attendee with custom-question answers." },
          { q: "Can I import existing attendees from another platform?", a: "Bulk import isn't built into the dashboard yet. Email support if you have a large list to migrate." },
          { q: "How do I delete my account?", a: "Email support — we'll soft-delete your user record. Your organization will need to designate a new owner first." },
          { q: "Is there a mobile app?", a: "Not yet. The site is fully responsive and works in any phone's browser, including the check-in scanner. Native apps are on the roadmap." },
          { q: "What happens if Stripe rejects an organization's onboarding?", a: "We send the organizer an email with Stripe's reason. The org can re-submit additional documentation; in the meantime, paid events stay disabled." },
          { q: "Can I run a virtual event?", a: "Yes. When creating the event, check 'This is a virtual event' and paste a Zoom/Meet URL. Confirmation emails include the URL automatically." },
        ].map((item, i) => (
          <div key={i} className="my-4">
            <h3>{i + 1}. {item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}

        <h2>13. Best practices</h2>
        <h3>Productivity tips</h3>
        <ul>
          <li>Use a draft event to prototype your page before publishing — drafts aren&rsquo;t public.</li>
          <li>Set up custom questions early; you can&rsquo;t add new ones after registrations come in.</li>
          <li>Save the public event URL as a browser bookmark while you&rsquo;re testing.</li>
          <li>Pre-build email broadcasts and schedule them rather than sending in real-time on event day.</li>
        </ul>
        <h3>Security recommendations</h3>
        <ul>
          <li>Turn on two-factor authentication on every organizer/admin account.</li>
          <li>Don&rsquo;t share login credentials — invite each team member with their own account.</li>
          <li>Review the audit log monthly to spot any unexpected actions.</li>
          <li>If a team member leaves, remove them from the Team page immediately. Their session expires within minutes.</li>
        </ul>
        <h3>Data quality standards</h3>
        <ul>
          <li>Keep your organization mailing address accurate — it&rsquo;s used on Stripe verification, billing receipts, and tax forms.</li>
          <li>Pick descriptive event names that include the year (&ldquo;Summer Fest 2026&rdquo;, not just &ldquo;Summer Fest&rdquo;) so attendees can tell editions apart.</li>
          <li>Use consistent product categories on vendor applications so you can filter and report cleanly.</li>
        </ul>
        <h3>Workflow recommendations</h3>
        <ul>
          <li><strong>Two weeks out:</strong> publish your event, send first announcement email.</li>
          <li><strong>One week out:</strong> review registrations, follow up with vendors who haven&rsquo;t paid.</li>
          <li><strong>Day of:</strong> log in to the check-in scanner before doors open. Test with one of your team&rsquo;s tickets first.</li>
          <li><strong>One day after:</strong> review financials, send thank-you email, post-event survey.</li>
        </ul>

        <h2>14. Glossary</h2>
        <dl>
          <dt><strong>Application fee</strong></dt>
          <dd>The 5% platform fee (with $1.25 minimum) YourEvents takes on every paid transaction.</dd>
          <dt><strong>Connect (Stripe Connect)</strong></dt>
          <dd>Stripe&rsquo;s payment platform that lets us route funds directly to organizer bank accounts.</dd>
          <dt><strong>Destination charge</strong></dt>
          <dd>The Stripe payment pattern we use — money flows to the organizer&rsquo;s Stripe account with our platform fee deducted.</dd>
          <dt><strong>Event tier</strong></dt>
          <dd>Either Free (basic, capped) or Single Event (premium, unlocked features). Set when the event is created.</dd>
          <dt><strong>Magic link</strong></dt>
          <dd>A passwordless sign-in link emailed to the user, valid for 15 minutes.</dd>
          <dt><strong>MCC</strong></dt>
          <dd>Merchant Category Code — Stripe&rsquo;s industry classification. We use 7922 (Theatrical Producers / Ticket Agencies).</dd>
          <dt><strong>MFA / 2FA</strong></dt>
          <dd>Multi-factor authentication. A 6-digit code from an authenticator app required at sign-in.</dd>
          <dt><strong>Org slug</strong></dt>
          <dd>The short URL identifier for an organization (e.g. <code>summer-fest</code> in <code>yourevents.app/o/summer-fest</code>).</dd>
          <dt><strong>Pass-through fee</strong></dt>
          <dd>An optional toggle that adds Stripe&rsquo;s processing fee (2.9% + $0.30) as a separate line item at checkout, paid by the attendee.</dd>
          <dt><strong>Platform fee</strong></dt>
          <dd>YourEvents&rsquo;s charge per paid transaction — 5% with a $1.25 minimum.</dd>
          <dt><strong>Presale (early-bird)</strong></dt>
          <dd>A time-limited discount applied automatically to every paid ticket purchased before a set deadline.</dd>
          <dt><strong>QR token</strong></dt>
          <dd>A signed, single-use code embedded in each ticket. Validated at the door to prevent duplicate entries.</dd>
          <dt><strong>SUPERADMIN</strong></dt>
          <dd>A platform-wide admin account at YourEvents. Sees every organization on the platform.</dd>
          <dt><strong>Vendor</strong></dt>
          <dd>A business that pays for a booth at an event. Separate from attendees but checked in the same way.</dd>
          <dt><strong>Waitlist magic link</strong></dt>
          <dd>The personalized registration link emailed to the next person on the waitlist when a spot opens up. Bypasses the sold-out screen.</dd>
          <dt><strong>Webhook</strong></dt>
          <dd>An automated message Stripe sends to YourEvents when a payment succeeds, fails, refunds, or disputes.</dd>
        </dl>

        <h2>15. Quick reference</h2>
        <h3>Most common tasks</h3>
        <ul>
          <li><strong>Create an event:</strong> <code>/dashboard/events/new</code></li>
          <li><strong>View registrations:</strong> <code>/dashboard/events/[event-id]/registrations</code></li>
          <li><strong>Review vendor applications:</strong> <code>/dashboard/events/[event-id]/vendors</code></li>
          <li><strong>Run check-in:</strong> <code>/checkin/[event-id]</code></li>
          <li><strong>Issue a refund:</strong> Registrations &rarr; click <strong>Refund</strong> on the row</li>
          <li><strong>See financials:</strong> <code>/dashboard/financials</code></li>
        </ul>
        <h3>Key navigation</h3>
        <ul>
          <li><strong>Dashboard:</strong> <code>/dashboard</code></li>
          <li><strong>Settings:</strong> <code>/dashboard/settings</code></li>
          <li><strong>Billing:</strong> <code>/dashboard/billing</code></li>
          <li><strong>Team:</strong> <code>/dashboard/team</code></li>
          <li><strong>Account (attendees):</strong> <code>/account</code></li>
          <li><strong>Platform Admin:</strong> <code>/admin</code></li>
        </ul>
        <h3>Important shortcuts</h3>
        <ul>
          <li><strong>Hard refresh</strong> after a deploy: <kbd>Ctrl+Shift+R</kbd> (Windows) or <kbd>Cmd+Shift+R</kbd> (Mac).</li>
          <li><strong>Print this guide:</strong> use the Print button above or <kbd>Ctrl+P</kbd> / <kbd>Cmd+P</kbd>.</li>
        </ul>
        <h3>Support contacts</h3>
        <ul>
          <li><strong>General support:</strong> <a href="mailto:events@yourevents.app">events@yourevents.app</a></li>
          <li><strong>Contact form:</strong> <Link href="/contact">yourevents.app/contact</Link></li>
          <li><strong>Status page:</strong> <Link href="/status">yourevents.app/status</Link></li>
        </ul>
      </UserGuideShell>

      <style>{`
        @media print {
          aside, header, .btn-primary, .btn-secondary { display: none !important; }
          article { max-width: 100% !important; }
        }
      `}</style>
    </main>
  );
}
