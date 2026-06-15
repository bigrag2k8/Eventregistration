import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          This reset link is missing its token. Please use the link from your email, or{" "}
          <Link href="/forgot-password" className="underline">request a new one</Link>.
        </div>
      )}
    </main>
  );
}
