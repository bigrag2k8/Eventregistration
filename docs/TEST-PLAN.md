# Your Events App — Full Manual Test Plan

A practical, end-to-end test plan for the whole application. Each suite lists
**what** it covers, **how** to test it (concrete steps), and the **expected**
result. Run the Golden-Path Flow (Section 0) first for a fast smoke test, then
the per-area suites for depth.

Production URL: `https://www.yourevents.app`

_Last updated: June 19, 2026_

---

## Prerequisites & environment

You need:

- **Stripe in test mode.** Use test card `4242 4242 4242 4242`, any future
  expiry, any CVC, any ZIP. (Decline card: `4000 0000 0000 0002`.)
- **A Connect-onboarded organization** for paid tickets. Paid ticket types are
  blocked until the org finishes Stripe Connect onboarding (Charges enabled).
- **The worker service running** (Railway `worker`). Required for waitlist
  promotion, reminder emails, and abandoned-cart cleanup.
- **`RESEND_API_KEY` set** (Railway web). Required for every email below.
- **Two browser contexts** — one normal (organizer/staff), one incognito
  (attendee/public), so you can hold two roles at once.
- **2–3 email inboxes you control** (or `+alias` addresses on one inbox) to play
  attendee, organizer, and a second attendee.
- **An authenticator app** (Google Authenticator / Authy / 1Password) for the MFA tests.
- **A test event** you can sell out cheaply (capacity 1–2, $1 tickets) for
  waitlist and refund testing.

Roles to have ready: one **Organizer**, one **Staff/Volunteer** (via invite),
one **SUPERADMIN** (platform admin), and 2 **Attendee** emails.

Pass/fail: mark each row. Any failure → note the test ID, steps, and actual vs
expected, plus the URL and (if an error) what the page/log showed.

---

## 0. Golden-Path Flow (run first — ~20 min smoke test)

This single sequence exercises the core lifecycle. If all of it passes, the app
is fundamentally healthy.

1. **Organizer signs up** at `/signup` → lands in dashboard.
2. **Create a paid event**, add a $1 General Admission ticket (org must be
   Connect-ready), add one custom question, **Publish**.
3. **Create a promo code** (`TEST10`, 10% off) on the event's Promo codes page.
4. In **incognito**, open the public event page, **Register**, apply `TEST10`,
   confirm the discount shows, pay with `4242…`.
5. Confirm the **success page** shows the QR ticket and the "Sign in to your
   account" prompt; confirm the **confirmation email** arrives with QR + ICS +
   sign-in link.
6. **Attendee signs in** via `/account/signin` magic link → `/account` shows the
   registration.
7. **Staff checks the attendee in** at `/checkin` (scan or manual token).
8. **Attendee requests a refund** from `/account` or the email link.
9. **Organizer approves** the refund request → attendee gets the decision email;
   `/account` shows REFUNDED with the refund date.
10. **Organizer financials** (`/dashboard/financials`) reflect the sale and the
    refund correctly.

If any step fails, run the matching suite below to isolate it.

---

## A. Authentication & accounts

| ID | What | How | Expected |
|----|------|-----|----------|
| A1 | Organizer signup | `/signup` → email, password (8+), name, org name, slug → submit | Account + org created; redirected to dashboard (or billing if plan not selected) |
| A2 | Organizer sign-in | `/signin` → correct email/password | Lands in `/dashboard` |
| A3 | Bad sign-in | `/signin` → wrong password | Generic "Invalid credentials"; same response time as unknown email |
| A4 | **Forgot password** | `/signin` → "Forgot password?" → enter org email | Generic "check your inbox"; reset email arrives within ~1 min |
| A5 | **Reset password** | Click email link → set new password (8+, confirm) → sign in | "Password updated"; old password rejected, new one works |
| A6 | Reset link reuse/expiry | Click the same reset link twice / after 15 min | Second use or expired link → "invalid or expired" |
| A7 | Staff invite | Dashboard → Team → invite a staff/volunteer email | Invite email arrives with accept link |
| A8 | Accept invite | Open invite link → set password | Account created at the invited role; can sign in |
| A9 | Staff destination | Sign in as STAFF/VOLUNTEER | Lands on `/checkin`, not `/dashboard` |
| A10 | **Attendee magic-link request** | `/account/signin` → enter email → send link | Generic "check your inbox"; magic-link email arrives |
| A11 | **Attendee sign-in** | Click magic link | Lands on `/account` signed in; link is single-use (second click fails) |
| A12 | **Guest backfill** | Register as guest first, then sign in with that email | Past registration appears in `/account` (linked on first sign-in) |
| A13 | Role gate: attendee→dashboard | While signed in as attendee, visit `/dashboard` | Redirected to `/account` (not shown org data) |
| A14 | Role gate: staff→account | While signed in as organizer/staff, visit `/account` | Redirected to `/dashboard` |
| A15 | Role gate: non-super→admin | Non-SUPERADMIN visits `/admin` | Redirected to `/dashboard` |
| A16 | No-enumeration | Request magic-link / forgot-password for a non-existent email | Same generic success; no email sent, no error revealing absence |
| A17 | **Enable MFA (TOTP)** | Dashboard → Settings → enable MFA; scan the QR in an authenticator app; confirm the 6-digit code | MFA enabled; 10 single-use recovery codes shown once |
| A18 | **MFA login challenge** | Sign out, then sign in again with MFA enabled | Prompted for a 6-digit code; the correct code lands in the dashboard |
| A19 | **MFA recovery code** | At the code prompt, enter a recovery code instead of the app code | Signs in; that recovery code cannot be reused |
| A20 | Disable MFA | Settings → disable MFA (confirm with a code) | MFA off; next sign-in needs no code |
| A21 | **Staff is password-only** | As a STAFF/VOLUNTEER email, request a magic link / open one | Blocked to `/signin?error=use_password`; only password sign-in works |
| A22 | Role-based session length | Sign in; inspect the session cookie Max-Age | ~12h for organizer/staff, ~7d for attendee |

---

## B. Event management (organizer)

| ID | What | How | Expected |
|----|------|-----|----------|
| B1 | Create free event | Dashboard → New event → Free tier | Event created as draft |
| B2 | Create premium event | New event → Single Event tier (spends 1 credit) | Credit decremented; event `isPremium` |
| B3 | Edit basics | Event page → edit name/description/dates/timezone → save | "Saved"; public page reflects changes; times render in event timezone |
| B4 | Banner image | Set a banner URL/upload | Image shows on public event page |
| B5 | Add free ticket | Add ticket type, price 0 | Created; "FREE" |
| B6 | Add paid ticket (no Connect) | On a non-Connect org, add a paid ticket | Blocked with `payouts_required` |
| B7 | Add paid ticket (Connect ready) | On Connect-ready org, add paid ticket + quantity | Created; quantity shown |
| B8 | Custom questions | Add required + optional questions | Appear on registration form; required enforced |
| B9 | Presale / early-bird | Set presale percent + end datetime | Active badge; public page shows early-bird banner; discount auto-applies before cutoff |
| B10 | **Promo code: percentage** | Promo codes page → `SAVE20`, 20% off | Listed ACTIVE; usage 0 / limit |
| B11 | **Promo code: fixed** | `FLAT5`, fixed $5 off | Listed; shows "$5.00 off" |
| B12 | **Promo code: usage limit** | Set limit 1 | After one redemption, second use rejected at checkout |
| B13 | **Promo code: expiry** | Set expiry in the past (or wait) | Shows EXPIRED; rejected at checkout |
| B14 | **Promo code: activate/deactivate** | Toggle a code inactive | Inactive code rejected at checkout; toggle back works |
| B15 | **Promo code: delete vs deactivate** | Try delete on an unused code (works) and a redeemed code (blocked) | Unused deletes; redeemed shows "deactivate instead" |
| B16 | **Promo code: duplicate** | Create two codes with same name on one event | Second blocked ("already exists") |
| B17 | Publish / unpublish | Toggle publish | Public page becomes reachable / hidden; private events excluded from `/api/events` |
| B18 | Upgrade free→premium | Free event → "Upgrade to Single Event" | Credit spent; premium features unlock (vendors, branding) |
| B19 | Action grid layout | View event page on desktop and mobile | Action boxes form a uniform grid (2 rows desktop), equal sizes, not squished |
| B20 | **Event QR code** | Event page → "QR code" (between Communications and Export CSV) → opens a popup window | QR points to the public event page; Copy / Close / Download PNG work; scanning opens registration |

---

## C. Public registration & payment

| ID | What | How | Expected |
|----|------|-----|----------|
| C1 | Free registration | Register for a free event | Status CONFIRMED immediately; QR issued; confirmation email |
| C2 | Paid registration | Register, pay with `4242…` | Redirect to Stripe → back to success; CONFIRMED after webhook; email |
| C3 | Declined card | Pay with `4000…0002` | Payment fails; no confirmed registration; seat not consumed |
| C4 | **Promo at checkout** | Enter a valid % code | Discount line appears; total and Pay button match; charge equals shown total |
| C5 | **Promo stacks with early-bird** | Active presale + valid promo | Both discounts apply (promo on the post-presale price) |
| C6 | Invalid promo | Enter a bad/expired/used code | Inline error; totals fall back to no-promo |
| C7 | **Address fields** | Fill address on registration | Stored; appears in CSV export |
| C8 | Duplicate email (confirmed) | Register same email twice | Second blocked with friendly message |
| C9 | Capacity enforcement | Fill the last seat, then a concurrent/second buyer | No oversell; second sees sold-out |
| C10 | Confirmation email | Check inbox after C1/C2 | QR attached, ICS "Add to Calendar", refund link, **account sign-in link** |
| C11 | Tickets behind key | Open success page without `?key=` | QR hidden ("check your email"); with correct key, QR shows |
| C12 | **Reissue tickets** | Registrations → "Reissue" on a confirmed registration | "Tickets reissued" banner; fresh confirmation email with a working QR |

---

## D. Waitlist

| ID | What | How | Expected |
|----|------|-----|----------|
| D1 | Sold-out shows waitlist | Sell out an event (capacity/ticket cap) | Public page shows "sold out" + waitlist form (if `waitlistEnabled`) |
| D2 | Join waitlist | Submit name/email | "You're on the waitlist! Position #N"; leave link shown |
| D3 | Duplicate waitlist | Join again same email | Blocked ("already on the waitlist") |
| D4 | **Auto-promotion** | Free a seat (refund/cancel a confirmed reg), wait for worker (~5 min) | Next person flips to PROMOTED; promotion email sent with "Claim your spot" |
| D5 | **Magic-link claim** | Click "Claim your spot" in the email | Register page prefilled; registering bypasses the sold-out check |
| D6 | CONVERTED | Complete the claim registration | Waitlist entry flips to CONVERTED |
| D7 | Leave waitlist | Click "Leave the waitlist" link | Status LEFT; confirmation page |
| D8 | Promotion expiry | Let a PROMOTED entry pass 24h without claiming | Worker flips it to EXPIRED |
| D9 | Organizer waitlist view | `/dashboard/events/[id]/waitlist` | Status counts + ordered queue; LEFT/EXPIRED/CONVERTED reflected |

---

## E. Check-in

| ID | What | How | Expected |
|----|------|-----|----------|
| E1 | QR scan | `/checkin` → scan a valid ticket QR | Checked in; shows attendee |
| E2 | Manual entry | Paste the QR token manually | Same as scan |
| E3 | Double scan | Scan the same ticket twice | Second → ALREADY_USED |
| E4 | Wrong-org ticket | Scan a ticket from another org | Rejected (org-scoped) |
| E5 | Cancelled/refunded ticket | Scan a ticket whose registration was cancelled/refunded | Invalid |
| E6 | Scanner resilience | Deny camera / no BarcodeDetector | Fallback notice; manual entry still works |

---

## F. Refunds

| ID | What | How | Expected |
|----|------|-----|----------|
| F1 | Organizer net refund | Registrations → Refund (net) | Attendee refunded ticket price minus 4.5%; status REFUNDED; seat released |
| F2 | SUPERADMIN full refund | As SUPERADMIN, Refund → Full (100%) | Full amount incl. fee returned |
| F3 | Organizer can't full-refund | As ORGANIZER, attempt full refund | Forbidden (server-enforced); only net available |
| F4 | Bulk refund | Select multiple regs → Refund selected | Each processed; result banner with counts |
| F5 | Vendor refund | Vendors page → Refund vendor (net/full) | Vendor booth refunded consistently |
| F6 | **Customer refund request** | Attendee `/account` or email → Request refund → reason | Request created OPEN; organizer notified by email |
| F7 | **Organizer approve** | Refund requests page → Approve | Stripe net refund issued; statuses updated; attendee gets approved email |
| F8 | **Organizer deny** | Approve another request as Deny + note | Status DENIED; attendee gets decision email with note |
| F9 | Duplicate request | Submit a second request while one is OPEN | Blocked (409) |
| F10 | **Refund shows in account** | After F1/F7, attendee opens `/account` | Card shows "Refunded $X on DATE" |
| F11 | Refund finance correctness | After a net refund, check `/dashboard/financials` | Fully-refunded ticket → $0 revenue/net/payout for organizer; platform keeps the retained fee |

---

## G. Financials & exports

| ID | What | How | Expected |
|----|------|-----|----------|
| G1 | Organizer financials | `/dashboard/financials` | Ticket/vendor revenue, net payout, fees, refunds, promo discounts, tax; trend chart; per-event table |
| G2 | Time-range filter | Switch 1D/1W/1M/All + custom range | Metrics + chart rescope correctly |
| G3 | Per-event financials | Event page Financials section | Per-ticket-type breakdown; matches org totals for that event |
| G4 | Registrations CSV | Export CSV → Registrations | Opens in Excel/Sheets; includes address + custom questions; no formula injection (leading `=` neutralized) |
| G5 | Vendors CSV | Export CSV → Vendors | Includes vendor + address columns |
| G6 | Platform financials | SUPERADMIN `/admin/financials` | Net GMV, platform fee revenue, MRR/ARR, leaderboard, disputes |

---

## H. Communications & emails

| ID | What | How | Expected |
|----|------|-----|----------|
| H1 | Confirmation email | (see C10) | Sent on confirm; EmailLog row SENT |
| H2 | Reminder emails | Set an event start soon; worker runs | Reminder sent once per window; no duplicates |
| H3 | Campaign/broadcast | Communications → send a campaign | Recipients receive it; send button shows pending state |
| H4 | **Refund notifications** | (see F6/F7/F8) | Organizer alerted on request; attendee alerted on decision |
| H5 | **Waitlist promotion email** | (see D4) | Promotion email with claim + leave links |
| H6 | **Magic-link / reset emails** | (see A4/A10) | Sent from platform sender; links use `www.yourevents.app` |
| H7 | Email escaping | Register with a name containing `<b>` | Email renders the literal text, not injected HTML |

---

## I. Admin (SUPERADMIN)

| ID | What | How | Expected |
|----|------|-----|----------|
| I1 | Org list/manage | `/admin` → org → Manage | Org details, subscription editor, plan overrides |
| I2 | Subscription editor | Set plan/status/credits/overrides | Saved; audit log written; reflected in enforcement |
| I3 | Connect reset | "Reset Stripe Connect" on an org | `stripeAccountId` nulled; org can re-onboard |
| I4 | Sub re-sync | "Re-sync from Stripe" | Pulls live subscription status |
| I5 | Financials | `/admin/financials` (see G6) | Platform metrics |

---

## J. Cross-cutting / non-functional

| ID | What | How | Expected |
|----|------|-----|----------|
| J1 | Mobile responsiveness | Resize to phone width on public + dashboard pages | Layouts adapt; action grid stacks to 2 columns; forms usable |
| J2 | API error shape | Hit a protected API while signed out | JSON 401/403, not an HTML 500 |
| J3 | Rate limiting | Spam magic-link/forgot-password/waitlist | After the limit, still generic 200, no abuse |
| J4 | Private events hidden | Mark an event private | Excluded from public `/api/events` and homepage |
| J5 | Redis outage tolerance | (If you can) stop Redis | Rate limiting fails open; sign-in/check-in still work |
| J6 | Sentry capture | Trigger a server error | Event appears in Sentry (note: stack traces minified until `SENTRY_AUTH_TOKEN` set) |
| J7 | Three login doors | Homepage header | "Attendee sign in", "Organizer & staff", "Sign up — host events" all route correctly |
| J8 | **Footer links resolve** | Footer (homepage + any marketing page) → click each link | How it works / Pricing / Help / Contact / Status / About / Security / Terms / Privacy all load (no 404) |
| J9 | **Pricing & fees page** | Visit `/pricing` | Free + $19 plans; "Fees on paid ticket sales & vendors" shows 4.5% + 2.9% + $0.30; free/$0 fee-free |
| J10 | **Security page** | Visit `/security` | "Security & compliance" page lists TLS, PCI via Stripe, MFA, signed QR, etc. |

---

## Regression checklist (run after any deploy)

- [ ] Homepage loads; three login buttons route correctly
- [ ] Organizer can sign in; attendee magic link works end to end
- [ ] Public event page loads; registration (free + paid) completes
- [ ] Confirmation email arrives with QR
- [ ] Check-in scans a fresh ticket
- [ ] Organizer financials render without error
- [ ] Event QR code button opens the popup and points to the public event page
- [ ] Footer links all resolve (no 404)
- [ ] No `0.0.0.0:8080` or redirect-loop errors on any auth redirect

---

## Out of scope (intentionally deferred — do not file as bugs)

- Partial (arbitrary-amount) refunds — only full and net-minus-fee exist
- Sentry source-map upload (stack traces minified until token added)
- Promo code `startsAt` (model field exists but start-time gating is not enforced; only expiry is)
- Legacy `/events/[slug]` cross-org slug ambiguity (`/o/[orgSlug]/...` is canonical)

---

## Notes for testers

- Use **incognito** for attendee/public flows so organizer cookies don't bleed in.
- After any deploy, **hard-refresh (Ctrl+Shift+R)** — cached pages cause false failures.
- The **worker runs on a ~5-minute tick**; waitlist promotion and reminders are
  not instant. Wait a cycle before calling them failed.
- All money is **Stripe test mode** — no real charges.
