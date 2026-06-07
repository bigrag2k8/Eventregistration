# EventFlow — Wireframes (ASCII)

> Low-fidelity reference. Final designs follow the component library in `src/components/`.

## Public Event Landing Page  `/events/[slug]`

```
┌─────────────────────────────────────────────────────────────────┐
│  EventFlow logo                       Browse  Sign in           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                         │   │
│   │              [BANNER IMAGE 1600x600]                    │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  AI Summit 2026                            ┌─────────────────┐  │
│  ★★★★★  Tech · Conference                  │  General  $199  │  │
│                                            │  Early   $149   │  │
│  📅 Sat, Aug 15 · 9:00 AM – 6:00 PM        │  VIP    $399    │  │
│  📍 Moscone Center, San Francisco          │                 │  │
│                                            │ [ REGISTER NOW ]│  │
│  About                                     │                 │  │
│  ─────                                     │  142 / 500 sold │  │
│  Join 500+ engineers for a day of …         │                 │  │
│  [more text]                                └─────────────────┘  │
│                                                                  │
│  Speakers                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ pic  │ │ pic  │ │ pic  │ │ pic  │                            │
│  │ name │ │ name │ │ name │ │ name │                            │
│  └──────┘ └──────┘ └──────┘ └──────┘                            │
│                                                                  │
│  Location                                                        │
│  ┌───────────────────────────────────────┐                       │
│  │      [GOOGLE MAPS EMBED]              │                       │
│  └───────────────────────────────────────┘                       │
│  747 Howard St, San Francisco, CA 94103  [Directions ↗]          │
│                                                                  │
│  Share: [FB] [X] [LI] [IG] [Email] [Copy link]                   │
└──────────────────────────────────────────────────────────────────┘
```

## Registration Form  `/events/[slug]/register`

```
┌─────────────────────────────────────────────────────────┐
│ ◀ Back        AI Summit 2026 — Register                 │
├─────────────────────────────────────────────────────────┤
│ 1. Select tickets                                       │
│ ┌─────────────────────────────────────────────────┐     │
│ │ Early Bird   $149   [- 1 +]    142 / 200 left   │     │
│ │ General      $199   [- 0 +]                     │     │
│ │ VIP          $399   [- 0 +]                     │     │
│ └─────────────────────────────────────────────────┘     │
│                                                         │
│ 2. Your info                                            │
│ First name [____________]  Last name [____________]     │
│ Email      [____________]  Phone     [____________]     │
│ Company    [____________]  Job title [____________]     │
│                                                         │
│ 3. Additional                                           │
│ Dietary     [Vegetarian ▾]                              │
│ Accessibility [_______________________]                 │
│ Special requests [_____________________]                │
│                                                         │
│ 4. Custom questions                                     │
│ How did you hear about us? [_______________]            │
│ T-shirt size?  ○ S ○ M ○ L ○ XL                        │
│                                                         │
│ 5. Promo code                                           │
│ [SUMMER20    ]  [Apply]   ✓ 20% off applied            │
│                                                         │
│ ─────────────────────────────────────                   │
│ Subtotal       $149.00                                   │
│ Discount       -$29.80                                   │
│ Tax (8.5%)      $10.13                                   │
│ Processing fee  $4.20                                    │
│ ─────────────────────────────────────                   │
│ Total          $133.53                                   │
│                                                         │
│            [ PAY & REGISTER → ]                          │
└─────────────────────────────────────────────────────────┘
```

## Organizer Dashboard  `/dashboard`

```
┌──────────────────────────────────────────────────────────────┐
│ EventFlow                          Events  Settings  Logout  │
├──────────┬───────────────────────────────────────────────────┤
│          │ Overview                            Last 30 days ▾│
│ Overview │                                                   │
│ Events   │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│ Registr. │ │ $24K │ │ 412  │ │ 87%  │ │  3   │               │
│ Reports  │ │Revenue│Regs  │CheckIn│ Events│                  │
│ Marketing│ └──────┘ └──────┘ └──────┘ └──────┘               │
│ Settings │                                                   │
│          │ Revenue (line chart)                              │
│          │ ┌─────────────────────────────────────────┐       │
│          │ │       /\        /\                      │       │
│          │ │      /  \      /  \   /\                │       │
│          │ │  ___/    \____/    \_/  \____           │       │
│          │ └─────────────────────────────────────────┘       │
│          │                                                   │
│          │ Recent registrations                              │
│          │ ┌─────────────────────────────────────────┐       │
│          │ │ Jane Doe  · AI Summit · $199 · CONFIRM  │       │
│          │ │ Mark Lee  · AI Summit · $399 · CONFIRM  │       │
│          │ │ Ana Cruz  · Workshop  · FREE · CHECKEDIN│       │
│          │ └─────────────────────────────────────────┘       │
└──────────┴───────────────────────────────────────────────────┘
```

## Mobile Check-In  `/checkin/[eventId]`

```
┌──────────────────────┐
│  ◀  AI Summit        │
├──────────────────────┤
│                      │
│ ┌──────────────────┐ │
│ │                  │ │
│ │   📷 CAMERA      │ │
│ │      VIEW        │ │
│ │  [aim QR here]   │ │
│ │                  │ │
│ └──────────────────┘ │
│                      │
│   Manual search      │
│ [______________]     │
│                      │
│   ✓ Checked in: 142  │
│   ○ Remaining:  358  │
└──────────────────────┘

After scan:

┌──────────────────────┐
│   ✅ CHECKED IN      │
│                      │
│   Jane Doe           │
│   Early Bird · $149  │
│   Order #A1B2C3      │
│                      │
│   [ Next scan ]      │
└──────────────────────┘
```
