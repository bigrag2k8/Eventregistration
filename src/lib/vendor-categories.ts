/**
 * Curated list of vendor product/service categories shown on the vendor
 * application form and as a filter on /admin/vendors. Single source of truth —
 * if you add or rename a category here, every consumer picks it up.
 *
 * Order matches the vendor form dropdown (most-common buckets first; "Other"
 * always last as a catch-all). Stored as the raw string in
 * VendorApplication.productCategory so legacy free-text values still display
 * correctly.
 */
export const VENDOR_CATEGORIES = [
  "Food & Beverage",
  "Beverages (non-alcoholic)",
  "Beer / Wine / Spirits",
  "Arts & Crafts",
  "Jewelry & Accessories",
  "Apparel & Clothing",
  "Beauty & Skincare",
  "Health & Wellness",
  "Home & Decor",
  "Plants & Florals",
  "Books, Authors & Media",
  "Toys & Kids",
  "Pet Products",
  "Photography & Print",
  "Tech & Electronics",
  "Automotive",
  "Services — Professional",
  "Services — Financial / Insurance",
  "Services — Real Estate",
  "Services — Home Improvement",
  "Education & Training",
  "Nonprofit / Civic",
  "Community Information",
  "Sponsor / Brand Activation",
  "Other",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export function isVendorCategory(value: unknown): value is VendorCategory {
  return typeof value === "string" && (VENDOR_CATEGORIES as readonly string[]).includes(value);
}
