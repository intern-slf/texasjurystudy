import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold">
        Structured focus groups with the right people
      </h1>

      <p className="mt-4 max-w-2xl text-muted-foreground">
        FocusGroup enables presenters to run professional focus group sessions
        by selecting participants through demographic screening and
        pre-session questionnaires.
      </p>

      <div className="mt-8 flex gap-4">
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
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Interactive features are available after signing up.
      </p>
    </main>
  );
}
