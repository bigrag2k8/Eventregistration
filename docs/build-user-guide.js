// One-shot generator for /public/YourEvents-User-Guide.docx.
// Run from the eventflow root: `node build-user-guide.js`.
// Mirrors src/app/(marketing)/guide/page.tsx — keep in sync if the page changes.

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, TabStopType, TabStopPosition, PageBreak, TableOfContents,
} = require("docx");

// ── Helpers ─────────────────────────────────────────────────────────────────
const p = (text, opts = {}) =>
  new Paragraph({
    ...opts,
    children: Array.isArray(text)
      ? text
      : [new TextRun({ text, ...(opts.run || {}) })],
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text })],
    spacing: { before: 360, after: 240 },
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text })],
    spacing: { before: 280, after: 160 },
  });

const para = (text) => p(text);

const bullet = (text) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text })],
  });

const num = (text) =>
  new Paragraph({
    numbering: { reference: "numbers", level: 0 },
    children: [new TextRun({ text })],
  });

const numList = (items) => items.map(num);
const bulletList = (items) => items.map(bullet);

// Bold inline helper for "Expected result:" / "Tip:" callouts inside paragraphs
const callout = (label, text) =>
  new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: " " + text }),
    ],
    spacing: { after: 120 },
  });

// ── Tables ──────────────────────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function tableCell(text, opts = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shading
      ? { fill: opts.shading, type: ShadingType.CLEAR }
      : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold || false,
            size: 20, // 10pt for tables
          }),
        ],
      }),
    ],
  });
}

function buildPermissionsMatrix() {
  // 5 cols: Function (2400), Attendee (1740), Staff (1740), Organizer (1740), SUPERADMIN (1740) = 9360 DXA
  const widths = [2400, 1740, 1740, 1740, 1740];
  const rows = [
    ["Function", "Attendee", "Staff / Volunteer", "Organizer / Admin", "SUPERADMIN"],
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
  ];

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: cells.map((c, i) =>
            tableCell(c, {
              width: widths[i],
              bold: rowIndex === 0,
              shading: rowIndex === 0 ? "F1F5F9" : undefined,
            })
          ),
        })
    ),
  });
}

function buildTroubleshootingTable() {
  // 3 cols: Problem (3120), Possible cause (3120), Resolution (3120) = 9360
  const widths = [3120, 3120, 3120];
  const rows = [
    ["Problem", "Possible cause", "Resolution"],
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
  ];

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: cells.map((c, i) =>
            tableCell(c, {
              width: widths[i],
              bold: rowIndex === 0,
              shading: rowIndex === 0 ? "F1F5F9" : undefined,
            })
          ),
        })
    ),
  });
}

// ── Content ─────────────────────────────────────────────────────────────────
const children = [];

// ── Title page ──
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 240 },
    children: [
      new TextRun({ text: "YourEvents", bold: true, size: 96, color: "1F3A8A" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 480 },
    children: [
      new TextRun({ text: "User Guide", bold: true, size: 64, color: "1F3A8A" }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new TextRun({
        text: "Complete how-to documentation for attendees, organizers,",
        size: 28,
        color: "475569",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [
      new TextRun({
        text: "vendors, staff, and platform administrators.",
        size: 28,
        color: "475569",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400 },
    children: [
      new TextRun({ text: "yourevents.app", size: 24, color: "1F3A8A" }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] })
);

// ── Table of Contents ──
children.push(
  h1("Table of Contents"),
  para("Click any section to jump to it. In Word, hold Ctrl (or Command on Mac) and click."),
  new Paragraph({
    children: [],
  }),
  new TableOfContents("YourEvents User Guide", {
    hyperlink: true,
    headingStyleRange: "1-2",
  }),
  new Paragraph({ children: [new PageBreak()] })
);

// ── Section 1: Document overview ──
children.push(
  h1("1. Document overview"),
  para(
    "YourEvents is a community-first event registration and ticketing platform. Each organization (the people hosting events) gets its own branded space at yourevents.app/o/your-org, where attendees register, pay, and receive QR-coded tickets. Organizers manage their lineup, vendor applications, on-site check-in, and refund requests from a single dashboard."
  ),
  h2("Who this guide is for"),
  ...bulletList([
    "Attendees — anyone buying tickets or registering for an event.",
    "Organizers — the people who host events and run organizations.",
    "Vendors — businesses that apply for booth space at an event.",
    "Staff / Volunteers — team members helping with day-of check-in.",
    "Platform admins (SUPERADMIN) — the YourEvents staff who oversee the whole platform.",
  ]),
  h2("Key benefits"),
  ...bulletList([
    "Flat pricing — 5% platform fee with a $1.25 minimum, no surprise buyer fees.",
    "Direct Stripe payouts to your bank account; we never hold organizer funds.",
    "Branded event pages with QR-coded tickets and instant refund handling.",
    "Vendor application and booth-payment flow built in — no separate system needed.",
  ]),
  h2("Scope of this guide"),
  para(
    "Every workflow available in the live application. If a feature exists in the app, you can find its how-to here. For platform technical detail (architecture, API, deployment), see the internal docs/ folder in the repository."
  )
);

// ── Section 2: Getting started ──
children.push(
  h1("2. Getting started"),
  h2("System requirements"),
  ...bulletList([
    "Any device with a modern web browser — desktop, tablet, or phone.",
    "Internet connection for registration, payment, and check-in.",
    "Email account that can receive transactional mail from events@yourevents.app.",
  ]),
  h2("Supported browsers"),
  para(
    "Chrome, Edge, Firefox, and Safari (current and prior major version). Mobile Safari and Chrome on Android are fully supported, including the check-in QR scanner."
  ),
  h2("Prerequisites"),
  ...bulletList([
    "Attendees: nothing — you don't need an account to register for an event. An account is created automatically if you want one.",
    "Organizers: a valid email address, a working phone number, your organization's mailing address, and a US bank account (for Stripe payouts).",
    "Vendors: business name, contact info, mailing address, and a description of what you sell.",
    "Staff: an invitation email from the organizer.",
  ]),
  h2("Account creation"),
  ...numList([
    "Go to yourevents.app/signup.",
    "Fill in your first name, last name, email, phone, and a password (at least 8 characters).",
    "Enter your organization name and a short URL slug (this becomes yourevents.app/o/your-slug).",
    "Fill in the mailing address — required for billing receipts and account verification. Start typing the street address and Google's autocomplete will fill in city/state/zip/country.",
    "Click Create account → pick a plan.",
  ]),
  callout(
    "Expected result:",
    "you are signed in and land on the billing page. The free tier is activated by default — you can pick a paid plan later."
  ),
  h2("Login process"),
  ...numList([
    "Go to yourevents.app/signin.",
    "Enter your email and password.",
    "If you have two-factor authentication enabled, enter the 6-digit code from your authenticator app.",
    "Click Sign in.",
  ]),
  callout(
    "Tip:",
    "attendees can also sign in by email link only (no password) — use the Email me a sign-in link option."
  ),
  h2("Password reset"),
  ...numList([
    "From the sign-in page, click Forgot password.",
    "Enter your email and click Send reset link.",
    "Check your inbox for an email from events@yourevents.app and click the reset link inside (valid for 30 minutes).",
    "Enter a new password twice and click Reset password.",
  ]),
  h2("First-time setup (organizers)"),
  ...numList([
    "After signup, visit Settings → add a logo, tagline, brand color, contact phone, and mailing address.",
    "Visit Billing → pick the Free tier (or a paid plan if you need more capacity).",
    "Visit Settings → Payouts (Stripe Connect) → click Connect Stripe. Complete the Stripe Express onboarding (5-10 minutes; Stripe verifies your identity and bank account).",
    "You're ready to create your first event.",
  ])
);

// ── Section 3: Application overview ──
children.push(
  h1("3. Application overview"),
  h2("High-level workflow"),
  para(
    "Most events follow the same arc: an organizer creates an event, attendees register and pay, optional vendors apply for booths and pay separately, the team scans QR tickets at the door on event day, and Stripe pays the organizer out shortly after. Refunds, waitlists, and email broadcasts run from the same dashboard."
  ),
  h2("User roles and permissions"),
  para("Every account has a single role. The role controls what you see in the app:"),
  ...bulletList([
    "ATTENDEE — register for events, view their own tickets, request refunds. No dashboard access.",
    "ORGANIZER — create and manage events, invite team members, edit other team members' info, view financials.",
    "ADMIN — same as Organizer, plus org-wide settings (rarely used; most orgs just have organizers).",
    "STAFF — check-in only. Can scan QR codes for events they're assigned to.",
    "VOLUNTEER — same as Staff. Separate label so organizers can distinguish paid vs unpaid helpers.",
    "SUPERADMIN — platform staff. Sees every organization, vendor, attendee on the platform.",
  ]),
  h2("Navigation overview"),
  ...bulletList([
    "Top nav — the main sections you can access for your role. Organizers see Dashboard, Financials, Billing, Audit log, Settings.",
    "Breadcrumb header — on detail pages, the breadcrumb shows where you are and lets you jump back.",
    "Footer — links to How it works, Pricing, vs Eventbrite, Help, Contact, Status, About, Security, Terms, Privacy.",
  ]),
  h2("Dashboard explanation"),
  para(
    "The Organizer Dashboard at /dashboard shows your upcoming events, ticket sales summary, and a list of recent registrations. Each event has its own management page with tabs for registrations, vendors, refund requests, promo codes, campaigns, waitlist, audit log, and financials."
  ),
  para(
    "The Attendee Account at /account shows your registered events, waitlist entries, refund requests, and profile page."
  ),
  para(
    "The Platform Admin area at /admin (SUPERADMIN only) has quick-action cards for Organizers, Vendors, Attendees, plus Financials, Audit log, and maintenance-mode toggle."
  )
);

// ── Section 4: Attendee guide ──
children.push(
  h1("4. Attendee guide"),
  para(
    "This section covers everything an attendee can do — finding events, registering, paying, and managing your account."
  ),
  h2("How to find an event"),
  ...numList([
    "Go to yourevents.app.",
    "Use the search box on the homepage to find events by name, category, city, or organizer.",
    "Or, if an organizer sent you a direct link (e.g. yourevents.app/o/summer-fest/events/main-event), click that to go straight to the event page.",
  ]),
  h2("How to sign up for an event (free)"),
  ...numList([
    "On the event page, click Register.",
    "Select the ticket type and quantity.",
    "Fill in your name, email, phone, and (optionally) company and mailing address.",
    "Answer any custom questions the organizer added.",
    "Click Complete registration.",
  ]),
  callout(
    "Expected result:",
    "a confirmation page shows your tickets, and a confirmation email with QR codes attached arrives within a minute."
  ),
  h2("How to pay for an event (paid ticket)"),
  ...numList([
    "On the event page, click Register.",
    "Select the ticket type and quantity. The order summary shows subtotal, any discount, tax, and total.",
    "Fill in your name, email, phone, and address.",
    "If you have a promo code, enter it in the Promo code field — the discount appears in the order summary if valid.",
    "Click Pay & register. You'll be redirected to Stripe's secure checkout.",
    "Enter your card details (or use Apple Pay / Google Pay / Link if offered) and click Pay.",
  ]),
  callout(
    "Expected result:",
    "Stripe redirects you back to YourEvents, your tickets are issued, and the confirmation email arrives within a minute."
  ),
  callout(
    "Common mistakes to avoid:",
    "don't close the Stripe tab before payment completes. If your card is declined, you'll see the error inline and can retry without losing your form input."
  ),
  h2("How to receive your tickets by email"),
  ...numList([
    "Tickets are emailed automatically the moment your registration confirms.",
    "Check your inbox for an email from events@yourevents.app with the subject 'You're registered: [event name]'.",
    "QR codes are embedded directly in the email body, so they survive being printed or forwarded.",
    "Each ticket admits one person. If you bought multiple tickets, each one has its own unique QR code.",
  ]),
  callout(
    "Tip:",
    "if the email hasn't arrived within five minutes, check your spam/junk folder. Add events@yourevents.app to your contacts so future event emails always land in your inbox."
  ),
  h2("How to access your account"),
  ...numList([
    "Go to yourevents.app/account/signin.",
    "Enter your email and click Email me a sign-in link.",
    "Check your inbox and click the link in the email (valid for 15 minutes).",
    "You'll land on your account dashboard.",
  ]),
  h2("How to view your registered events"),
  ...numList([
    "Sign in to your account at yourevents.app/account.",
    "The My Events tab lists every event you've registered for, with upcoming events at the top.",
    "Click any event to see the full ticket details and the QR code.",
  ]),
  h2("How to update your profile"),
  ...numList([
    "From your account dashboard, click Profile.",
    "Edit your first name, last name, phone, or change your password.",
    "Click Save changes.",
  ]),
  para("The new name and contact info will be used on future registrations automatically."),
  h2("How to request a refund"),
  ...numList([
    "Sign in to your account.",
    "Open the My Events tab and click the event you want a refund for.",
    "Click Request refund.",
    "Type a reason (at least 10 characters) so the organizer understands your situation.",
    "Click Submit refund request.",
  ]),
  callout(
    "Expected result:",
    "you'll see a confirmation that the request was submitted, and the organizer is notified by email. You'll get an email when they approve or decline."
  ),
  callout(
    "Note:",
    "the 5% platform fee is non-refundable per the event's refund policy. If the organizer approves the refund, you'll receive your ticket price minus that fee, returned to your original payment method within 5-10 business days."
  ),
  h2("How to join a waitlist"),
  ...numList([
    "If an event is sold out, the registration page shows a Join the waitlist button.",
    "Click it and enter your name, email, and phone.",
    "Click Add me to the waitlist.",
  ]),
  callout(
    "What happens next:",
    "if a registered attendee cancels, the next person on the waitlist gets an email with a magic link to register. You have ~24 hours to claim the spot before it's offered to the next person."
  ),
  h2("How to leave a waitlist"),
  ...numList([
    "Open the waitlist confirmation email you received when you joined.",
    "Click the Leave waitlist link at the bottom of the email.",
    "Confirm on the page that opens.",
  ])
);

// ── Section 5: Organizer guide ──
children.push(
  h1("5. Organizer guide"),
  para(
    "This section covers everything an organizer does — setting up your account, creating events, managing registrations, vendors, refunds, and your team."
  ),
  h2("How to set up your organization profile"),
  ...numList([
    "From the dashboard, click Settings.",
    "Update the organization name, tagline, and about description. These appear on your public page at yourevents.app/o/your-slug.",
    "Upload a logo URL and choose a brand color (hex value like #1F3A8A). The brand color is used for buttons and accents on your public pages.",
    "Fill in contact email, phone, and mailing address. All required.",
    "Click Save settings.",
  ]),
  callout(
    "Expected result:",
    "a green confirmation popup appears in the center of the screen, and your changes are live on the public org page immediately."
  ),
  h2("How to connect Stripe to get paid"),
  ...numList([
    "From Settings, scroll to the Payouts (Stripe Connect) section.",
    "Click Connect Stripe. You'll be redirected to Stripe's Express onboarding.",
    "Enter your business details — Stripe verifies your identity (driver's license or passport) and bank account routing/account number.",
    "When complete, you're redirected back to YourEvents settings.",
  ]),
  callout(
    "Expected result:",
    "the Payouts section shows enabled in green. You can now create paid events."
  ),
  callout(
    "Tip:",
    "the verification takes 5-10 minutes typically. If Stripe needs additional info, they'll email you directly."
  ),
  h2("How to create your first event"),
  ...numList([
    "From the dashboard, click + New Event.",
    "Pick a tier: Free (up to 50 attendees, basic features) or Single Event ($19, unlimited registrations + vendor flow + branding).",
    "Enter the event name, short description, and full description.",
    "Pick start and end date/time and a timezone.",
    "Fill in the venue address — autocomplete fills city/state/zip. Or check Virtual event and paste a Zoom/Meet URL.",
    "Add at least one ticket type (e.g. General Admission, free or with a price).",
    "Optionally add a banner image and event tags.",
    "Click Save as draft or Save and publish.",
  ]),
  callout(
    "Expected result:",
    "you land on the event management page where you can add more ticket types, set up promo codes, etc."
  ),
  h2("How to add ticket types"),
  ...numList([
    "Open the event management page.",
    "In the Ticket types section, click + Add ticket type.",
    "Enter the name (e.g. 'Early Bird', 'VIP'), price, and total quantity available.",
    "Optionally set a sales start/end date if the tier is time-limited.",
    "Click Add ticket type.",
  ]),
  para("You can add as many tiers as you want. Free tickets can coexist with paid ones."),
  h2("How to add promo codes"),
  ...numList([
    "Open the event management page and click Promo codes.",
    "Click + Add promo code.",
    "Enter the code (e.g. SUMMER10), discount type (percentage or fixed dollar amount), and discount value.",
    "Optionally set a usage limit (e.g. first 50 uses) and expiration date.",
    "Click Save.",
  ]),
  callout("Tip:", "share the code in your marketing emails. Attendees enter it at checkout."),
  h2("How to set up an early-bird presale discount"),
  ...numList([
    "Open the event management page and scroll to Presale discount.",
    "Check Enable presale.",
    "Enter the discount percentage (e.g. 20 for 20%) and the date/time the presale ends.",
    "Click Save presale settings.",
  ]),
  para(
    "The discount is automatically applied to every paid ticket purchased before the deadline. Attendees see the strikethrough price on the event page."
  ),
  h2("How to add custom registration questions"),
  ...numList([
    "Open the event management page and click Custom questions.",
    "Click + Add question.",
    "Pick a question type: text, long text, dropdown, radio, checkbox, email, phone, or number.",
    "Enter the question label and (if applicable) the answer options.",
    "Check Required if it must be answered.",
    "Click Save.",
  ]),
  para(
    "The question appears in step 3 of the attendee registration form. Answers are stored on each registration and included in CSV exports."
  ),
  h2("How to add a banner image (and reframe it)"),
  ...numList([
    "Open the event management page and scroll to Banner image.",
    "Click Choose image and pick a wide image (16:6 aspect ratio looks best).",
    "The image uploads to Cloudinary. Once it's done, a preview appears.",
    "Drag inside the preview frame to reposition the image. Use the zoom slider to scale it.",
    "Check Fit entire image to frame if you want the whole image visible with letterbox space (instead of cropping).",
    "Click Save changes.",
  ]),
  para(
    "The preview frame on the editor matches the public event page exactly — what you see is what attendees see."
  ),
  h2("How to enable waitlist"),
  ...numList([
    "Open the event management page.",
    "In the event basics section, check Enable waitlist when sold out.",
    "Click Save changes.",
  ]),
  para(
    "When all ticket types reach their capacity, the registration page automatically shows a Join waitlist button instead."
  ),
  h2("How to enable vendor applications"),
  ...numList([
    "Open the event management page.",
    "Check Accept vendor applications.",
    "(Optional) Enter vendor application notes — these appear on the vendor form (e.g. 'Booths are 10x10 with table and chairs. Load-in 7am day of event').",
    "Enter the default vendor booth price. This pre-fills when you approve each vendor; you can override per-vendor at approval time. Leave at $0 if you'll quote each vendor individually.",
    "Click Save changes.",
  ]),
  para("The public event page now shows a Become a Vendor button."),
  h2("How to review and approve a vendor application"),
  ...numList([
    "When a vendor submits an application, every organizer and admin in your org gets a notification email titled 'New vendor application — [event name]'.",
    "Click Review vendor application in the email, or go to the event management page and click Vendors.",
    "The application card shows the company name, contact, email, phone, mailing address, product category, booth preference, and description.",
    "Click Approve, optionally adjust the quoted booth price, and add approval notes if you want to.",
    "Click Send payment link. A secure Stripe checkout link is emailed to the vendor automatically.",
  ]),
  callout(
    "Expected result:",
    "the vendor receives an approval email with a one-click payment link. Once they pay, they become a confirmed vendor with the same QR-ticketed credentials as attendees."
  ),
  h2("How to publish your event"),
  ...numList([
    "Open the event management page.",
    "Make sure you have at least one ticket type added.",
    "Click Publish in the top-right.",
  ]),
  para(
    "The event is now public at yourevents.app/o/your-org/events/your-event-slug. The status changes from DRAFT to PUBLISHED."
  ),
  h2("How to share your event"),
  ...bulletList([
    "Copy the public URL from the top of the event management page and share by email, Slack, Facebook, etc.",
    "The metadata is set up so when you paste the link into iMessage, Slack, LinkedIn, etc., a preview card with the banner image appears.",
  ]),
  h2("How to view and manage registrations"),
  ...numList([
    "Open the event management page and click Registrations.",
    "Each row shows the attendee name, email, ticket type, quantity, total paid, and status.",
    "Use the filter dropdown to narrow to a single status (CONFIRMED, PENDING, REFUNDED).",
    "Click Export CSV to download the full list.",
  ]),
  h2("How to issue a refund"),
  ...numList([
    "On the Registrations page, find the attendee.",
    "Click Refund in their row.",
    "Confirm the dialog. The attendee's ticket price minus the 5% platform fee is returned to their original payment method.",
  ]),
  callout(
    "Tip:",
    "to refund multiple attendees at once, check the boxes next to each row and click Refund selected (minus 5%)."
  ),
  h2("How to send an email broadcast"),
  ...numList([
    "Open the event management page and click Campaigns.",
    "Click + New campaign.",
    "Enter a subject and email body (HTML supported).",
    "Pick the audience: all confirmed attendees, or filter by status / ticket type.",
    "Click Send now.",
  ]),
  callout(
    "Note:",
    "the number of campaigns you can send per event is capped by your plan. Free events: 1 campaign. Single-event: 5 campaigns. See /dashboard/billing for current limits."
  ),
  h2("How to do on-site check-in"),
  ...numList([
    "On event day, go to yourevents.app/checkin/[event-id] on your phone or any device with a camera.",
    "Allow camera access when prompted.",
    "Point the camera at the attendee's QR code. The scanner reads it automatically.",
    "A green checkmark confirms a valid first-time check-in. A red warning means the ticket was already scanned or is invalid.",
  ]),
  callout(
    "Manual check-in:",
    "if a QR scan fails, click Search attendees, find them by name or email, and click Check in."
  ),
  h2("How to view financials"),
  ...numList([
    "From the dashboard, click Financials.",
    "Pick a time range: Last hour, day, week, month, year, or all-time.",
    "The page shows gross revenue, refunds, platform fees, net payout, and a trend chart.",
    "Click Export CSV for a per-event breakdown.",
  ]),
  h2("How to invite a team member"),
  ...numList([
    "From the dashboard, click Team.",
    "Click + Invite team member.",
    "Enter their email, name, and pick a role: Organizer, Staff, or Volunteer.",
    "(Optional) write a role description and a personal message.",
    "Click Send invite.",
  ]),
  para(
    "They receive an email with a link to set up their account. Pending invites appear on the Team page with options to resend or revoke."
  ),
  h2("How to edit a team member's info"),
  ...numList([
    "From the Team page, click Edit next to the member's name.",
    "Update their first name, last name, email, phone, mailing address, or role.",
    "Click Save changes.",
  ]),
  callout(
    "Note:",
    "only ORGANIZER role users can edit other team members. You can't change your own role; another organizer has to do that for you."
  ),
  h2("How to set up two-factor authentication"),
  ...numList([
    "From the dashboard, click Settings.",
    "Scroll to Two-factor authentication.",
    "Click Enable two-factor.",
    "Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy, etc.).",
    "Enter the 6-digit code to verify and click Confirm.",
    "Save the recovery codes shown — you'll need one if you lose your phone.",
  ])
);

// ── Section 6: Vendor guide ──
children.push(
  h1("6. Vendor guide"),
  para(
    "This section covers everything a vendor does — finding events, applying, and paying for your booth."
  ),
  h2("How to find a vendor application"),
  ...numList([
    "The organizer will share a direct link, or you can find their public event page at yourevents.app/o/their-org/events/event-name.",
    "On the event page, look for a Become a Vendor button.",
    "Click it to open the vendor application form.",
  ]),
  h2("How to fill out a vendor application"),
  ...numList([
    "Enter your company name and contact info (first name, last name, email, phone).",
    "Add your website (optional) and logo URL (optional).",
    "Fill in your mailing address — autocomplete fills city/state/zip.",
    "Pick a product category from the dropdown (e.g. Food & Beverage, Arts & Crafts).",
    "Describe what you'll offer (minimum 10 characters).",
    "(Optional) note a booth size preference.",
    "(Optional) add any additional requests or special notes.",
    "Click Submit application.",
  ]),
  callout(
    "Expected result:",
    "a confirmation page appears. The organizer is notified by email immediately."
  ),
  h2("What happens after you submit"),
  ...numList([
    "The organizer reviews your application — typically within a few days.",
    "If approved, you receive an email with the quoted booth price and a secure payment link.",
    "If declined, you receive an email letting you know.",
    "If they need more info, they'll reply directly to your application email.",
  ]),
  h2("How to pay for your booth"),
  ...numList([
    "Open the approval email and click Pay for your booth.",
    "The page shows your booth fee and event details.",
    "Click Pay now to open Stripe's secure checkout.",
    "Enter your card details and click Pay.",
  ]),
  callout(
    "Expected result:",
    "Stripe redirects you back, your status changes to PAID, and you receive a vendor pass email with a QR code. Show the QR at vendor load-in on event day."
  ),
  h2("How to update or withdraw your application"),
  para(
    "You can't edit your application after submitting. If you need to change details (booth size, what you're selling, contact info), email the organizer directly. To withdraw, contact the organizer and they'll mark your application as WITHDRAWN."
  )
);

// ── Section 7: Staff and volunteer guide ──
children.push(
  h1("7. Staff and volunteer guide"),
  para("This section covers how a team member helps with day-of check-in."),
  h2("How to accept your invitation"),
  ...numList([
    "Open the invitation email from events@yourevents.app.",
    "Click Accept invitation.",
    "Set a password and click Create my account.",
  ]),
  para(
    "You're now signed in. Staff and volunteer accounts can only access the check-in scanner, not the dashboard."
  ),
  h2("How to access the check-in scanner"),
  ...numList([
    "Sign in at yourevents.app/signin.",
    "You land on the check-in event picker, showing every event you're assigned to.",
    "Tap the event you're working.",
    "The scanner opens. Allow camera access when prompted.",
  ]),
  h2("How to scan attendee QR codes"),
  ...numList([
    "Hold your phone (or any device with a camera) up to the attendee's QR code — printed or shown on their phone.",
    "The scanner reads it automatically. Green = valid check-in. Red = duplicate scan or invalid ticket.",
    "Continue scanning the next attendee.",
  ]),
  h2("How to manually check in someone whose QR won't scan"),
  ...numList([
    "Tap Search attendees in the scanner UI.",
    "Type the attendee's name or email.",
    "Tap their name in the results, then tap Check in.",
  ]),
  h2("What you can and can't see"),
  ...bulletList([
    "Can see: the events you're assigned to, attendee names for check-in, real-time arrival counts.",
    "Can't see: the organizer dashboard, financials, billing, refund requests, vendor management, settings.",
  ])
);

// ── Section 8: Platform admin guide ──
children.push(
  h1("8. Platform admin guide (SUPERADMIN)"),
  para("This section is for YourEvents staff who oversee the whole platform."),
  h2("How to access the platform admin area"),
  ...numList([
    "Sign in with your SUPERADMIN account.",
    "From the dashboard, click Platform Admin in the top nav (or go to /admin directly).",
  ]),
  h2("How to invite a new organization"),
  ...numList([
    "From the admin overview, click + Invite organization.",
    "Enter the organization name, slug, and the contact person's email.",
    "Click Send invite. The contact receives an email to set up their account.",
  ]),
  h2("How to browse all organizers"),
  ...numList([
    "From the admin overview, click All organizers.",
    "Use the filters to narrow by plan, subscription status, or Stripe Connect status.",
    "Click Export CSV to download.",
  ]),
  h2("How to browse all vendors"),
  ...numList([
    "From the admin overview, click All vendors.",
    "Use the filters to narrow by org, event, status, or product category.",
    "Click Edit on any row to modify vendor company / contact / address / booth details.",
    "Click Export CSV to download.",
  ]),
  h2("How to browse all attendees"),
  ...numList([
    "From the admin overview, click All attendees.",
    "Filter by date range, org, event, or status.",
    "Click Export CSV for a full report.",
  ]),
  h2("How to view platform financials"),
  ...numList([
    "From admin nav, click Financials.",
    "Pick a time range. The page shows platform fee revenue, subscription revenue, GMV, take rate, and a trend chart.",
  ]),
  h2("How to review the audit log"),
  ...numList([
    "From admin nav, click Audit log.",
    "Filter by org, action type, or text search.",
    "Every significant action (publish, refund, role change) is recorded with who, what, when, and metadata.",
  ]),
  h2("How to enable maintenance mode"),
  ...numList([
    "From the admin overview, scroll to Maintenance mode.",
    "Click Enable maintenance.",
    "Optionally set an end time and a custom message.",
    "Click Save.",
  ]),
  para(
    "Non-SUPERADMIN users see a maintenance page until you disable it. SUPERADMINs continue to have full access during maintenance."
  )
);

// ── Section 9: User roles and permissions matrix ──
children.push(
  h1("9. User roles and permissions matrix"),
  para("Compare what each role can do:"),
  buildPermissionsMatrix(),
  new Paragraph({ children: [], spacing: { after: 240 } })
);

// ── Section 10: Notifications and alerts ──
children.push(
  h1("10. Notifications and alerts"),
  para("Most YourEvents notifications arrive by email. Some are also surfaced in the dashboard."),
  h2("System notifications"),
  ...bulletList([
    "Registration confirmation — sent to the attendee with QR-coded tickets attached.",
    "Reminder emails — 30 days, 7 days, 1 day, and 1 hour before the event.",
    "Waitlist promotion — when a spot opens up, sent to the next person on the list.",
    "Refund-request received — sent to the organizer when an attendee requests a refund.",
    "Refund decision — sent to the attendee when the organizer approves or declines.",
    "New vendor application — sent to every organizer and admin in the org.",
    "Vendor approval — sent to the vendor with their payment link.",
  ]),
  h2("Warning messages"),
  para("Amber banners appear in the dashboard when something needs your attention:"),
  ...bulletList([
    "Please add your mailing address to complete your organization profile.",
    "Connect Stripe to accept paid registrations.",
    "Your subscription is past due — update your payment method.",
  ]),
  h2("Error messages"),
  para("Red banners appear when an action fails:"),
  ...bulletList([
    "End time must be after the start time.",
    "That email is already in use by another account.",
    "You can't demote the last organizer. Promote someone else first.",
  ]),
  h2("Confirmation messages"),
  para("Green popup toasts appear in the center of the screen for any successful save:"),
  ...bulletList([
    "Saved (auto-dismisses after ~1.6s).",
    "Updated [name].",
    "Invite sent to [email].",
  ])
);

// ── Section 11: Troubleshooting ──
children.push(
  h1("11. Troubleshooting guide"),
  buildTroubleshootingTable(),
  new Paragraph({ children: [], spacing: { after: 240 } })
);

// ── Section 12: FAQ ──
const FAQS = [
  ["Do I need an account to register for an event?", "No. You can register as a guest. An attendee account is created automatically if you want one, so you can view your tickets later by signing in with a magic link."],
  ["How much does YourEvents cost?", "Hosting free events is free. Paid events have a 5% platform fee with a $1.25 minimum per paid ticket. Vendor booth payments use the same fee."],
  ["When do I get paid as an organizer?", "Payouts go directly to your Stripe-linked bank account on Stripe's normal schedule — typically 2 business days after the charge."],
  ["Why is there a minimum platform fee?", "Stripe's processing cost (2.9% + $0.30) eats more than 5% on tickets under $25. The $1.25 floor keeps the platform net-positive on every paid ticket."],
  ["Can I sell tickets in person at the door?", "Yes — log in on a phone and use the registration form to add walk-ups. They'll get tickets emailed immediately and the QR scans the same as online registrations."],
  ["What if I forgot my password?", "Click Forgot password on the sign-in page. You'll get a reset link by email valid for 30 minutes."],
  ["How do I cancel my event?", "From the event management page, click Unpublish to take it offline temporarily, or Delete event under Danger zone to soft-delete it. Existing registrations remain visible for record-keeping."],
  ["Can I refund just part of a registration?", "Refunds are full-ticket only (minus the 5% platform fee). To partially refund, contact us directly."],
  ["What happens to the platform fee on a refund?", "The 5% platform fee is non-refundable per the event's refund policy. The attendee receives their ticket price minus the fee."],
  ["Can vendors get refunded?", "Yes. From the Vendors page on your event management dashboard, click Refund vendor. The booth payment minus the 5% platform fee is returned. Their vendor pass is invalidated."],
  ["How do I change my organization's URL?", "The URL slug (e.g. yourevents.app/o/your-slug) can only be changed by a platform admin to prevent broken links. Email support to request the change."],
  ["Can attendees buy more than one ticket?", "Yes. Most events allow up to 10 tickets per order by default. Organizers can lower this on a per-event basis."],
  ["Does YourEvents charge attendees any extra fees?", "No. The price you set is the price the attendee pays. We charge the organizer; we never tack a service fee onto the buyer's checkout."],
  ["What's the difference between Organizer, Admin, Staff, and Volunteer?", "Organizers and Admins manage the org (create events, see financials, invite team). Staff and Volunteers handle on-site check-in only. Staff vs. Volunteer is just a label for paid vs. unpaid helpers."],
  ["How many events can I create on the Free plan?", "One event per month, up to 50 registrations per event. Upgrade to a Single Event credit ($19) to lift the cap and unlock vendor flow and unlimited registrations."],
  ["Do I have to use Stripe to get paid?", "Yes. Stripe Connect is the only payout method. They handle KYC and tax reporting; we never hold your money."],
  ["Can I export my attendee list?", "Yes. From the Registrations page on your event, click Export CSV. The download includes every attendee with custom-question answers."],
  ["Can I import existing attendees from another platform?", "Bulk import isn't built into the dashboard yet. Email support if you have a large list to migrate."],
  ["How do I delete my account?", "Email support — we'll soft-delete your user record. Your organization will need to designate a new owner first."],
  ["Is there a mobile app?", "Not yet. The site is fully responsive and works in any phone's browser, including the check-in scanner. Native apps are on the roadmap."],
  ["What happens if Stripe rejects an organization's onboarding?", "We send the organizer an email with Stripe's reason. The org can re-submit additional documentation; in the meantime, paid events stay disabled."],
  ["Can I run a virtual event?", "Yes. When creating the event, check 'This is a virtual event' and paste a Zoom/Meet URL. Confirmation emails include the URL automatically."],
];

children.push(h1("12. Frequently asked questions"));
FAQS.forEach(([q, a], i) => {
  children.push(h2(`${i + 1}. ${q}`));
  children.push(para(a));
});

// ── Section 13: Best practices ──
children.push(
  h1("13. Best practices"),
  h2("Productivity tips"),
  ...bulletList([
    "Use a draft event to prototype your page before publishing — drafts aren't public.",
    "Set up custom questions early; you can't add new ones after registrations come in.",
    "Save the public event URL as a browser bookmark while you're testing.",
    "Pre-build email broadcasts and schedule them rather than sending in real-time on event day.",
  ]),
  h2("Security recommendations"),
  ...bulletList([
    "Turn on two-factor authentication on every organizer/admin account.",
    "Don't share login credentials — invite each team member with their own account.",
    "Review the audit log monthly to spot any unexpected actions.",
    "If a team member leaves, remove them from the Team page immediately. Their session expires within minutes.",
  ]),
  h2("Data quality standards"),
  ...bulletList([
    "Keep your organization mailing address accurate — it's used on Stripe verification, billing receipts, and tax forms.",
    "Pick descriptive event names that include the year (Summer Fest 2026, not just Summer Fest) so attendees can tell editions apart.",
    "Use consistent product categories on vendor applications so you can filter and report cleanly.",
  ]),
  h2("Workflow recommendations"),
  ...bulletList([
    "Two weeks out: publish your event, send first announcement email.",
    "One week out: review registrations, follow up with vendors who haven't paid.",
    "Day of: log in to the check-in scanner before doors open. Test with one of your team's tickets first.",
    "One day after: review financials, send thank-you email, post-event survey.",
  ])
);

// ── Section 14: Glossary ──
const GLOSSARY = [
  ["Application fee", "The 5% platform fee (with $1.25 minimum) YourEvents takes on every paid transaction."],
  ["Connect (Stripe Connect)", "Stripe's payment platform that lets us route funds directly to organizer bank accounts."],
  ["Destination charge", "The Stripe payment pattern we use — money flows to the organizer's Stripe account with our platform fee deducted."],
  ["Event tier", "Either Free (basic, capped) or Single Event (premium, unlocked features). Set when the event is created."],
  ["Magic link", "A passwordless sign-in link emailed to the user, valid for 15 minutes."],
  ["MCC", "Merchant Category Code — Stripe's industry classification. We use 7922 (Theatrical Producers / Ticket Agencies)."],
  ["MFA / 2FA", "Multi-factor authentication. A 6-digit code from an authenticator app required at sign-in."],
  ["Org slug", "The short URL identifier for an organization (e.g. summer-fest in yourevents.app/o/summer-fest)."],
  ["Pass-through fee", "An optional toggle that adds Stripe's processing fee (2.9% + $0.30) as a separate line item at checkout, paid by the attendee."],
  ["Platform fee", "YourEvents's charge per paid transaction — 5% with a $1.25 minimum."],
  ["Presale (early-bird)", "A time-limited discount applied automatically to every paid ticket purchased before a set deadline."],
  ["QR token", "A signed, single-use code embedded in each ticket. Validated at the door to prevent duplicate entries."],
  ["SUPERADMIN", "A platform-wide admin account at YourEvents. Sees every organization on the platform."],
  ["Vendor", "A business that pays for a booth at an event. Separate from attendees but checked in the same way."],
  ["Waitlist magic link", "The personalized registration link emailed to the next person on the waitlist when a spot opens up. Bypasses the sold-out screen."],
  ["Webhook", "An automated message Stripe sends to YourEvents when a payment succeeds, fails, refunds, or disputes."],
];

children.push(h1("14. Glossary"));
GLOSSARY.forEach(([term, def]) => {
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({ text: term, bold: true }),
        new TextRun({ text: " — " + def }),
      ],
    })
  );
});

// ── Section 15: Quick reference ──
children.push(
  h1("15. Quick reference"),
  h2("Most common tasks"),
  ...bulletList([
    "Create an event: /dashboard/events/new",
    "View registrations: /dashboard/events/[event-id]/registrations",
    "Review vendor applications: /dashboard/events/[event-id]/vendors",
    "Run check-in: /checkin/[event-id]",
    "Issue a refund: Registrations → click Refund on the row",
    "See financials: /dashboard/financials",
  ]),
  h2("Key navigation"),
  ...bulletList([
    "Dashboard: /dashboard",
    "Settings: /dashboard/settings",
    "Billing: /dashboard/billing",
    "Team: /dashboard/team",
    "Account (attendees): /account",
    "Platform Admin: /admin",
  ]),
  h2("Important shortcuts"),
  ...bulletList([
    "Hard refresh after a deploy: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac).",
    "Print this guide: use the Print button on /guide, or Ctrl+P / Cmd+P from your browser.",
  ]),
  h2("Support contacts"),
  ...bulletList([
    "General support: events@yourevents.app",
    "Contact form: yourevents.app/contact",
    "Status page: yourevents.app/status",
  ])
);

// ── Document ────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "YourEvents",
  title: "YourEvents User Guide",
  description:
    "Complete how-to documentation for attendees, organizers, vendors, staff, and platform administrators.",
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1F3A8A" },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "1F3A8A" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    },
  ],
});

const outDir = path.join(__dirname, "public");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "YourEvents-User-Guide.docx");

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`Wrote ${outPath} (${kb} KB)`);
});
