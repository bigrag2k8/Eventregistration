import { signOutAction } from "@/app/dashboard/actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction} className="inline">
      <button type="submit" className={className || "text-sm text-slate-600 hover:text-red-600"}>
        Sign out
      </button>
    </form>
  );
}
