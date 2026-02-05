import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold">
        Structured focus groups with the right people
      </h1>

      <p className="mt-4 max-w-2xl text-muted-foreground">
        FocusGroup enables presenters to run professional focus group sessions
        by selecting participants through demographic screening and
        pre-session questionnaires.
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/auth/signup?role=participant"
          className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Join as Participant
        </Link>

        <Link
          href="/auth/signup?role=presenter"
          className="rounded-md border px-6 py-3 font-medium transition hover:bg-muted"
        >
          Run a Focus Group
        </Link>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Interactive features are available after signing up.
      </p>
    </section>
  );
}
