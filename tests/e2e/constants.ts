// Shared fixtures created by `npm run seed` (prisma/seed.ts). The smoke suite
// asserts against these known values, so a change to the seed must be mirrored
// here. Login: organizer@example.com / password123.
export const STORAGE_STATE = "tests/e2e/.auth/organizer.json";

export const ORGANIZER = { email: "organizer@example.com", password: "password123" };
export const ORG = { slug: "acme-events", name: "Acme Events" };
export const EVENT = {
  slug: "ai-summit-2026",
  name: "AI Summit 2026",
  ticketName: "General Admission",
  // 19900 cents, rendered server-side — the "prices never come from the client"
  // invariant made visible.
  ticketPrice: /\$199(\.00)?/,
};
