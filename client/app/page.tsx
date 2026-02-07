import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {/* Heading — from screenshot */}
      <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
        Welcome to Texas Jury Study
      </h1>

      {/* Paragraph — EXACT screenshot text */}
      <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
        Thank you for your interest in participating in a Texas jury study!
        We conduct jury studies virtually via Zoom. We will notify you by
        email if you are selected and ask that you give unbiased opinions
        about real cases going to trial.
      </p>

      {/* Buttons — unchanged */}
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
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

      {/* Footer note — still aligned with screenshot intent */}
      <p className="mt-8 text-sm text-muted-foreground">
        Interactive features are available after signing up.
      </p>
    </section>
  );
}
