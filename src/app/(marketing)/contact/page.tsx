import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact support — Your Events App",
  description: "Get in touch with the Your Events App team.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Contact support</h1>
      <p className="mt-4 text-lg text-slate-600">
        Send us a message — typically a reply within one business day. Or email{" "}
        <a href="mailto:support@yourevents.app" className="text-brand-700 hover:underline">
          support@yourevents.app
        </a>{" "}
        directly.
      </p>

      <div className="mt-8">
        <ContactForm />
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Looking for quick answers first? Try the{" "}
        <Link href="/help" className="text-brand-700 hover:underline">help center</Link>.
      </p>
    </main>
  );
}
