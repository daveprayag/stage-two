import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { themeScript } from "@/components/ThemeToggle";
import { getScreen } from "@/lib/data";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({ variable: "--font-instrument", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Stage Two", template: "%s · Stage Two" },
  description: "End-of-day momentum screener for NSE stocks: stage analysis, relative strength, bases, breakouts and the news behind each move.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const screen = await getScreen().catch(() => null);
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Header asOf={screen?.asOf ?? null} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-ink-3 sm:flex-row sm:justify-between sm:px-6">
            <span>Stage Two · NSE end-of-day data, updated every evening.</span>
            <span>A screener, not advice. Shortlists are for your own review; none of these screens is a tested buy signal.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
