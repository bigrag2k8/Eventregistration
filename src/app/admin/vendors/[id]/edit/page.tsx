import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ErrorBanner } from "@/components/ErrorBanner";
import { AddressFields } from "@/components/AddressFields";
import { VENDOR_CATEGORIES } from "@/lib/vendor-categories";
import { updateVendorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const vendor = await prisma.vendorApplication.findUnique({
    where: { id: params.id },
    include: {
      event: {
        select: {
          name: true,
          organization: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!vendor) notFound();

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="text-slate-500">/</span>
            <Link href="/admin/vendors" className="text-sm opacity-80 hover:opacity-100">Vendors</Link>
            <span className="text-slate-500">/</span>
            <span className="font-semibold">Edit</span>
          </div>
          <Link href="/admin/vendors" className="text-sm opacity-80 hover:opacity-100">◀ Back</Link>
        </div>
      </header>

      <form action={updateVendorAction} className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        <input type="hidden" name="vendorId" value={vendor.id} />

        <div>
          <h1 className="text-2xl font-bold">Edit {vendor.companyName}</h1>
          <p className="text-sm text-slate-500">
            Vendor application for <strong>{vendor.event.name}</strong> ({vendor.event.organization.name}) ·{" "}
            <span className="font-mono text-xs">{vendor.status}</span>
          </p>
        </div>

        <section className="card">
          <h2 className="text-lg font-semibold">Company &amp; contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Company name *</label>
              <input name="companyName" required maxLength={200} defaultValue={vendor.companyName} className="input" />
            </div>
            <div>
              <label className="label">Contact first name *</label>
              <input name="contactFirstName" required maxLength={80} defaultValue={vendor.contactFirstName} className="input" />
            </div>
            <div>
              <label className="label">Contact last name *</label>
              <input name="contactLastName" required maxLength={80} defaultValue={vendor.contactLastName} className="input" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input name="email" type="email" required maxLength={200} defaultValue={vendor.email} className="input" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input name="phone" required maxLength={40} defaultValue={vendor.phone ?? ""} className="input" placeholder="(555) 123-4567" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Website</label>
              <input name="website" type="url" maxLength={200} defaultValue={vendor.website ?? ""} className="input" placeholder="https://" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Mailing address</h2>
          <div className="mt-4">
            <AddressFields
              required
              defaults={{
                addressLine1: vendor.addressLine1,
                addressLine2: vendor.addressLine2,
                city: vendor.city,
                state: vendor.state,
                zipCode: vendor.zipCode,
                country: vendor.country,
              }}
            />
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Booth &amp; offering</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="label">Description *</label>
              <textarea name="description" required rows={4} maxLength={4000} defaultValue={vendor.description} className="input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Product category *</label>
                <select name="productCategory" required defaultValue={vendor.productCategory ?? ""} className="input">
                  <option value="">Select a category…</option>
                  {/* Include any legacy free-text value so it stays selected when editing */}
                  {vendor.productCategory && !(VENDOR_CATEGORIES as readonly string[]).includes(vendor.productCategory) && (
                    <option value={vendor.productCategory}>{vendor.productCategory} (legacy)</option>
                  )}
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Booth preference</label>
                <input name="boothPreference" maxLength={200} defaultValue={vendor.boothPreference ?? ""} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Additional requests</label>
              <textarea name="additionalRequests" rows={3} maxLength={2000} defaultValue={vendor.additionalRequests ?? ""} className="input" />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link href="/admin/vendors" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Save changes</button>
        </div>
      </form>
    </main>
  );
}
