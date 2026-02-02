import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center">
      {/* NAVBAR */}
      <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
        <div className="w-full max-w-6xl flex justify-between items-center px-6 text-sm">
          <Link href="/" className="font-semibold text-base">
            FocusGroup
          </Link>

          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="flex-1 w-full max-w-6xl px-6 py-20 flex flex-col gap-24">
        {/* HERO */}
        <section className="text-center flex flex-col gap-6">
          <h1 className="text-4xl font-semibold">
            {user
              ? "Welcome back to FocusGroup"
              : "Structured focus groups with the right people"}
          </h1>

          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {user
              ? "Continue where you left off."
              : "FocusGroup helps presenters run professional focus group sessions by selecting participants through demographic screening and structured pre-session questionnaires."}
          </p>

          <div className="flex justify-center gap-4 mt-6">
            {!user ? (
              <>
                <Link
                  href="/auth/signup?role=participant"
                  className="px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium"
                >
                  Join as Participant
                </Link>
                <Link
                  href="/auth/signup?role=presenter"
                  className="px-6 py-3 rounded-md border font-medium"
                >
                  Run a Focus Group
                </Link>
              </>
            ) : (
              <Link
                href="/dashboard"
                className="px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium"
              >
                Continue
              </Link>
            )}
          </div>

          {!user && (
            <p className="text-sm text-muted-foreground mt-4">
              Interactive features are available after signing up.
            </p>
          )}
        </section>

        {/* PARTICIPANT SECTION */}
        <section className="grid md:grid-cols-2 gap-12 items-start">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-medium">
              For Participants
            </h2>
            <p className="text-muted-foreground">
              Participate in selected focus group discussions based on your
              background and screening responses. Sessions are conducted through
              scheduled online meetings.
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Complete demographic and screening forms</li>
              <li>Get shortlisted for relevant sessions</li>
              <li>Join live discussions via meeting links</li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-medium">
              For Presenters
            </h2>
            <p className="text-muted-foreground">
              Create and manage professional focus groups by defining participant
              criteria and conducting structured live discussions.
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Define demographics and screening questions</li>
              <li>Review and shortlist participants</li>
              <li>Collect structured feedback</li>
            </ul>
          </div>
        </section>
      </div>

      {/* FOOTER */}
      <footer className="w-full border-t py-10 flex justify-center text-xs text-muted-foreground">
        <div className="flex items-center gap-6">
          <span>© {new Date().getFullYear()} FocusGroup</span>
          <ThemeSwitcher />
        </div>
      </footer>
    </main>
  );
}
