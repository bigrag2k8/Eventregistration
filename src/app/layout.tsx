import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Automated I.T. Solutions Events APP",
  description: "Event registration powered by Automated I.T. Solutions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
