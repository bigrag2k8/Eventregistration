import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { requireRoleApi } from "@/lib/auth";

export async function POST() {
  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer for this organization yet." }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
