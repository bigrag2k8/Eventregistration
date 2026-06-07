import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EventFlow",
  description: "Modern event registration for organizations of every size.",
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
