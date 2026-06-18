export const metadata = {
  title: "Status — Your Events App",
  description: "Current operational status of Your Events App.",
};

const COMPONENTS = [
  { name: "Website & dashboard", note: "Public pages, organizer dashboard, and account area" },
  { name: "Registration & checkout", note: "Ticket purchase and card payments" },
  { name: "Email delivery", note: "Confirmations, tickets, and reminders" },
  { name: "Check-in & QR scanning", note: "Door check-in and QR validation" },
];

export default function StatusPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">System status</h1>

      <div className="mt-6 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
        <span className="font-medium text-emerald-800">All systems operational</span>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {COMPONENTS.map((c, i) => (
          <div
            key={c.name}
            className={`flex items-center justify-between gap-4 bg-white px-5 py-4 ${
              i > 0 ? "border-t border-slate-100" : ""
            }`}
          >
            <div>
              <div className="font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500">{c.note}</div>
            </div>
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              Operational
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm leading-relaxed text-slate-500">
        This page is maintained by our team. If you&apos;re experiencing a problem that isn&apos;t reflected
        here, please let us know at{" "}
        <a href="mailto:events@yourevents.app" className="text-brand-700 hover:underline">
          events@yourevents.app
        </a>{" "}
        so we can look into it.
      </p>
    </main>
  );
}
