import Link from "next/link";

export default function SignUpClosedPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="card text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-2xl font-bold">Sign-up is by invitation only</h1>
        <p className="mt-3 text-slate-600">
          The Your Events App is currently invite-only. If you'd like to host
          your events on this platform, please contact us and we'll get you set up.
        </p>
        <div className="mt-6 space-y-2 text-sm">
          <div>
            <a href="mailto:events@yourevents.app" className="btn-primary inline-block">
              Email us to request access
            </a>
          </div>
          <div className="text-slate-500">
            Already have an account?{" "}
            <Link href="/signin" className="text-brand-700 hover:underline">Sign in →</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
