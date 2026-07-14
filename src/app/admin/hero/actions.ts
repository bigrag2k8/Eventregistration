"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  heroImageUrl: z.string().url().max(500).optional().or(z.literal("")),
  heroHeadline: z.string().max(120).optional(),
  heroSubhead: z.string().max(280).optional(),
  heroCtaText: z.string().max(40).optional(),
  // Allow a relative path (#events, /signup) or an absolute URL.
  heroCtaHref: z.string().max(300).optional(),
  // Banner framing (BannerImageInput submits these fixed field names).
  bannerPositionX: z.coerce.number().min(0).max(100).optional(),
  bannerPositionY: z.coerce.number().min(0).max(100).optional(),
  bannerZoom: z.coerce.number().min(1).max(3).optional(),
  bannerFitToFrame: z.string().optional(),
});

/**
 * SUPERADMIN-only: set the public homepage hero banner (image + headline +
 * button). Empty fields are stored as null so the homepage falls back to the
 * code defaults (src/lib/homepage.ts HERO) per field.
 */
export async function updateHomepageHeroAction(formData: FormData) {
  requireRole(["SUPERADMIN"], await getSession());
  const session = await getSession();

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin?error=validation#hero");
  const d = parsed.data;
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);

  const framing = {
    heroPositionX: d.bannerPositionX ?? 50,
    heroPositionY: d.bannerPositionY ?? 50,
    heroZoom: d.bannerZoom ?? 1,
    heroFitToFrame: d.bannerFitToFrame === "1",
  };
  const heroData = {
    heroImageUrl: clean(d.heroImageUrl),
    heroHeadline: clean(d.heroHeadline),
    heroSubhead: clean(d.heroSubhead),
    heroCtaText: clean(d.heroCtaText),
    heroCtaHref: clean(d.heroCtaHref),
    ...framing,
  };

  await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: heroData,
    create: { id: "singleton", ...heroData },
  });

  await audit({
    userId: session?.sub,
    action: "platform.homepage_hero_updated",
    targetType: "PlatformConfig",
    targetId: "singleton",
    metadata: { hasImage: !!clean(d.heroImageUrl) },
  });

  revalidatePath("/");
  redirect("/admin?saved=1#hero");
}
