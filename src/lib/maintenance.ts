import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { JwtPayload } from "@/lib/auth";

export interface MaintenanceState {
  /** True iff maintenance is on right now (auto-expires when `until` passes). */
  active: boolean;
  /** Custom message override, or null to use the default. */
  message: string | null;
  /** When maintenance auto-expires, or null for "until manually disabled". */
  until: Date | null;
  /** When this maintenance window was started. */
  startedAt: Date | null;
  /** user.id of the SUPERADMIN who started it (for audit display). */
  startedById: string | null;
}

const INACTIVE: MaintenanceState = {
  active: false, message: null, until: null, startedAt: null, startedById: null,
};

let _cache: { state: MaintenanceState; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

/**
 * Read the current platform maintenance state. Cached in-process for 5 seconds
 * so callers (root layout reads this on every page render) don't hammer the DB.
 *
 * Falls open: if the DB read fails for any reason, we report inactive. Locking
 * the entire site out because of a DB hiccup is worse than the site being up
 * with an unread flag.
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.state;

  let state: MaintenanceState = INACTIVE;
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { id: "singleton" },
    });
    if (row?.maintenanceMode) {
      const expired = row.maintenanceUntil != null && row.maintenanceUntil.getTime() < now;
      state = expired
        ? INACTIVE
        : {
            active: true,
            message: row.maintenanceMessage,
            until: row.maintenanceUntil,
            startedAt: row.maintenanceStartedAt,
            startedById: row.maintenanceStartedById,
          };
    }
  } catch (e) {
    console.error("[maintenance] state read failed, treating as inactive:", e);
  }

  _cache = { state, expiresAt: now + CACHE_TTL_MS };
  return state;
}

/** Drop the in-process cache so the next read sees fresh state immediately. */
export function invalidateMaintenanceCache(): void {
  _cache = null;
}

/**
 * For API routes: return a 503 NextResponse if maintenance is active and the
 * caller isn't a SUPERADMIN, or null when the request should proceed.
 *
 *   const block = await maintenanceGuard(session);
 *   if (block) return block;
 *
 * Webhook + admin endpoints should NOT call this — webhooks must keep
 * processing (Stripe will retry forever otherwise), and admin endpoints are how
 * SUPERADMINs disable maintenance.
 */
export async function maintenanceGuard(session: JwtPayload | null): Promise<NextResponse | null> {
  const state = await getMaintenanceState();
  if (!state.active) return null;
  if (session?.role === "SUPERADMIN") return null;
  return NextResponse.json(
    {
      error: "maintenance",
      message: state.message ?? "Your Events App is undergoing a short maintenance. Please try again shortly.",
      until: state.until?.toISOString() ?? null,
    },
    { status: 503 },
  );
}
