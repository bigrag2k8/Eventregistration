import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRoleApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { invalidateMaintenanceCache } from "@/lib/maintenance";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    message: z.string().max(500).optional(),
    /** ISO date or null. Null = "until manually disabled". */
    until: z.string().datetime().nullable().optional(),
  }),
  z.object({ action: z.literal("stop") }),
]);

/**
 * SUPERADMIN-only: turn the platform maintenance window on or off.
 *
 * The toggle is intentionally simple: there's a single singleton row and we
 * upsert it. Every change writes an AuditLog entry, and the in-process cache in
 * lib/maintenance.ts is invalidated so the new state takes effect on the next
 * read (within this instance). Other web instances pick it up on their next
 * cache miss (5 seconds).
 */
export async function POST(req: Request) {
  const gate = await requireRoleApi(["SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.action === "start") {
    const until = data.until ? new Date(data.until) : null;
    await prisma.platformConfig.upsert({
      where: { id: "singleton" },
      update: {
        maintenanceMode: true,
        maintenanceUntil: until,
        maintenanceMessage: data.message?.trim() || null,
        maintenanceStartedById: session.sub,
        maintenanceStartedAt: new Date(),
      },
      create: {
        id: "singleton",
        maintenanceMode: true,
        maintenanceUntil: until,
        maintenanceMessage: data.message?.trim() || null,
        maintenanceStartedById: session.sub,
        maintenanceStartedAt: new Date(),
      },
    });
    await audit({
      userId: session.sub,
      action: "platform.maintenance_on",
      targetType: "Platform",
      metadata: { message: data.message ?? null, until: until?.toISOString() ?? null, by: session.email },
    });
  } else {
    await prisma.platformConfig.upsert({
      where: { id: "singleton" },
      update: {
        maintenanceMode: false,
        maintenanceUntil: null,
        maintenanceMessage: null,
        maintenanceStartedById: null,
        maintenanceStartedAt: null,
      },
      create: { id: "singleton", maintenanceMode: false },
    });
    await audit({
      userId: session.sub,
      action: "platform.maintenance_off",
      targetType: "Platform",
      metadata: { by: session.email },
    });
  }

  invalidateMaintenanceCache();
  return NextResponse.json({ ok: true });
}
