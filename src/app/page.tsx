import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-brand-700">
            Your Events App
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/signin">Sign in</Link>
            <Link href="/signup" className="btn-primary">Sign up — host events</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Your Events App</h1>
        <p className="mt-4 text-xl text-slate-600">
          Modern event registration, ticketing, and check-in for organizations of every size.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Sign up — start free
          </Link>
          <Link href="/signin" className="btn-secondary">Sign in to your account</Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Free tier available · No credit card required to start
        </p>

        <p className="mt-12 text-sm text-slate-500">
          To view a specific organization's events, use the link they shared with you
          (e.g., <code className="rounded bg-slate-100 px-1.5 py-0.5">/o/their-name</code>).
        </p>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Your Events App ·{" "}
          <a href="mailto:events@yourevents.app" className="hover:text-slate-700">events@yourevents.app</a>
          {" · "}
          <a href="https://www.yourevents.app" className="hover:text-slate-700">yourevents.app</a>
        </div>
      </footer>
    </main>
  );
}
