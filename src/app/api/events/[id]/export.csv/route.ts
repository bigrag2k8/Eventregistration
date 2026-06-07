import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  const event = await prisma.event.findUnique({ where: { id: params.id }, include: { customQuestions: true } });
  if (!event || event.organizationId !== session.orgId) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const regs = await prisma.registration.findMany({
    where: { eventId: event.id, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
    include: { ticketType: true, tickets: { include: { checkIn: true } }, answers: true },
  });

  const headers = [
    "Registration ID", "First Name", "Last Name", "Email", "Phone", "Company", "Job Title",
    "Ticket Type", "Quantity", "Total", "Status", "Confirmed At", "Checked In",
    ...event.customQuestions.map((q) => q.label),
  ];
  const rows = regs.map((r) => {
    const allChecked = r.tickets.length > 0 && r.tickets.every((t) => t.checkIn);
    const answerMap = new Map(r.answers.map((a) => [a.questionId, a.answer]));
    return [
      r.id, r.firstName, r.lastName, r.email, r.phone ?? "", r.company ?? "", r.jobTitle ?? "",
      r.ticketType.name, String(r.quantity), (r.totalCents / 100).toFixed(2), r.status,
      r.confirmedAt?.toISOString() ?? "",
      allChecked ? "yes" : "no",
      ...event.customQuestions.map((q) => answerMap.get(q.id) ?? ""),
    ];
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
    },
  });
}
