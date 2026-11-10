import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/NavLinks";
import { themeScript } from "@/components/ThemeToggle";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({ variable: "--font-instrument", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Stage Two", template: "%s · Stage Two" },
  description: "End-of-day momentum screener for NSE stocks: stage analysis, relative strength, bases, breakouts and the news behind each move.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] font-sans antialiased md:pb-0">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-1.5 px-4 py-6 text-xs leading-relaxed text-ink-3 sm:px-6 md:flex-row md:justify-between lg:px-8">
            <span>Stage Two · NSE end-of-day data, updated every evening.</span>
            <span>A screener, not advice. Shortlists are for your own review, not tested buy signals.</span>
          </div>
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
