import type { Metadata } from "next";
import { Card, Page } from "@/components/Page";
import { safeNext } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; out?: string }> }) {
  const q = await searchParams;
  return (
    <Page narrow>
      <div className="mx-auto mt-10 w-full max-w-sm sm:mt-16">
        <h1 className="font-display text-4xl tracking-tight text-ink">Stage Two</h1>
        <p className="mt-2 text-sm text-ink-2">{q.out ? "Logged out." : "Private. Enter your passcode to continue."}</p>
        <Card className="mt-6 p-5">
          <LoginForm next={safeNext(q.next)} />
        </Card>
      </div>
    </Page>
  );
}
