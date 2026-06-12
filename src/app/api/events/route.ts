import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRoleApi } from "@/lib/auth";

const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad query" }, { status: 400 });
  const { q, category, tag, cursor, limit } = parsed.data;

  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      isPrivate: false, // private events are direct-link only — never in public search
      startAt: { gte: new Date() },
      ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }),
      ...(category && { category }),
      ...(tag && { tags: { some: { tag } } }),
    },
    include: { location: true, ticketTypes: true },
    orderBy: { startAt: "asc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, -1) : events;
  return NextResponse.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
}

const createSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(120),
  description: z.string().min(10),
  shortDescription: z.string().optional(),
  category: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().default("UTC"),
  capacity: z.number().int().positive().optional(),
  refundPolicy: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireRoleApi(["ORGANIZER", "ADMIN"]);
  if (session instanceof NextResponse) return session;
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.create({
    data: {
      ...parsed.data,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      organizationId: session.orgId,
      status: "DRAFT",
    },
  });
  return NextResponse.json(event, { status: 201 });
}
