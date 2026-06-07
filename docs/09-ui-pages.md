# EventFlow — UI Page Designs

## Page inventory

### Public (no auth)
| Route                             | Purpose                          |
|-----------------------------------|----------------------------------|
| `/`                               | Browse events grid               |
| `/events`                         | Filtered listing                 |
| `/events/[slug]`                  | Event landing page               |
| `/events/[slug]/register`         | Multi-section registration form  |
| `/events/[slug]/success`          | Post-registration confirmation   |
| `/r/[code]`                       | Referral redirect → event page   |
| `/signin`                         | Sign-in                          |
| `/signup`                         | Create account                   |
| `/manage/[token]`                 | Magic-link self-service portal    |

### Organizer (`/dashboard/*`)
| Route                                       | Purpose                          |
|---------------------------------------------|----------------------------------|
| `/dashboard`                                | Metrics overview                 |
| `/dashboard/events`                         | List + filter events             |
| `/dashboard/events/new`                     | 7-step event builder             |
| `/dashboard/events/[id]`                    | Event detail tabs                |
| `/dashboard/events/[id]/tickets`            | Ticket types editor              |
| `/dashboard/events/[id]/questions`          | Custom questions editor          |
| `/dashboard/events/[id]/registrations`      | Attendee list w/ search & export |
| `/dashboard/events/[id]/marketing`          | Promo codes, referrals, campaigns|
| `/dashboard/events/[id]/analytics`          | Revenue, funnel, segments        |
| `/dashboard/events/[id]/settings`           | Policy, tax, fees                |
| `/dashboard/registrations`                  | Cross-event registration search  |
| `/dashboard/marketing`                      | Org-wide campaigns               |
| `/dashboard/team`                           | Invite staff/organizers          |

### Check-In (PWA)
| Route                  | Purpose            |
|------------------------|--------------------|
| `/checkin/[eventId]`   | Camera scanner UI  |
| `/checkin/[eventId]/list` | Attendee search list |

## Design tokens

- **Color** — `brand-{50…900}` blue scale (Tailwind config).
- **Type** — Inter (system fallback).
- **Spacing** — 4/8/12/16/24/32 px stepped.
- **Radius** — `rounded-lg` (8px) for inputs, `rounded-xl` (12px) for cards.
- **Shadows** — soft, low-elevation; modal uses 24px diffused.

## Component primitives (`src/components/`)
- `Button` (primary/secondary/ghost/destructive)
- `Card` (`card` utility)
- `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`
- `Modal`, `Drawer`
- `Toast` (Sonner-style)
- `Tabs`, `Tooltip`, `Badge`
- `Stat`, `EmptyState`
- `ShareBar`
- `RegistrationForm`
- `CheckinScanner`
- `EventCard`, `EventTimelineRow`

## Responsive rules

- All grids collapse to single column at `<sm`.
- Header turns into hamburger drawer at `<md`.
- Forms are mobile-first; payment summary docks to the bottom on small screens.
- Tap targets ≥ 44px.

## Accessibility

- Semantic HTML (`<button>`, `<a>`, proper `<label for>`).
- WCAG AA color contrast.
- `aria-live=polite` on toast and scanner result.
- Focus rings always visible.
- Form errors announced via `aria-invalid` + `aria-describedby`.
