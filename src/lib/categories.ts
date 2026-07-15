/**
 * The category options offered when creating/editing an event or a recurring
 * event. Single source of truth — the list used to be copy-pasted per form,
 * which is how they drifted apart.
 *
 * The value is stored as free text on Event.category / RecurringEvent.category,
 * so older rows may hold a category no longer listed here; forms preserve an
 * unknown stored value rather than silently dropping it. The homepage maps
 * these to icons by keyword (see categoryIcon in src/app/page.tsx), so a new
 * entry only needs an icon rule there if no existing keyword matches it.
 */
export const EVENT_CATEGORIES = [
  "Technology",
  "Business",
  "Education",
  "Health & Wellness",
  "Food",
  "Arts",
  "Music",
  "Sports",
  "Community",
  "Nonprofit",
  "Networking",
  "Workshop",
  "Conference",
  "Training",
  "Other",
] as const;

/**
 * Options for a category <select>: the standard list, plus `current` when it's
 * a non-empty value that isn't in the list (a legacy or hand-typed category) so
 * editing an event can't silently reassign it.
 */
export function categoryOptions(current?: string | null): string[] {
  const list = [...EVENT_CATEGORIES] as string[];
  if (current && !list.includes(current)) return [current, ...list];
  return list;
}
