/**
 * Injects per-org CSS variables so the page can use the org's brand color
 * without rebuilding Tailwind. Drop it inside the root layout of a page
 * that has an org context.
 *
 * Usage:
 *   <OrgBrandStyle color={org.brandColor} />
 *   <button style={{ backgroundColor: 'var(--org-brand)' }}>...</button>
 */
export function OrgBrandStyle({ color }: { color: string | null | undefined }) {
  const c = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#1F3A8A";
  // Compute a darker hover variant by reducing each channel by ~12%
  const hover = darken(c, 0.12);
  return (
    <style>{`:root { --org-brand: ${c}; --org-brand-hover: ${hover}; }`}</style>
  );
}

function darken(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.floor(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.floor(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.floor((n & 255) * (1 - amount)));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase();
}
