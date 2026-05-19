"use client";

import Link from "next/link";
import { ArrowRight, Gavel, Scale, Users, Video, ClipboardList, MessagesSquare } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthHash = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/dashboard");
      }
    };

    if (typeof window !== "undefined" && window.location.hash) {
      handleAuthHash();
    }
  }, [router]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center py-20 text-center md:py-32 bg-gradient-to-b from-background to-secondary/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="space-y-6 max-w-5xl px-6">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium border-transparent bg-secondary text-secondary-foreground">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            Virtual focus groups for Texas legal cases
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
            We run focus groups <br className="hidden md:block" />
            <span className="text-primary">for real legal cases.</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            Texas Jury Study connects attorneys with everyday Texans in structured, virtual focus groups. Lawyers learn how real jurors react to their case. Participants get paid for their honest opinion.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row pt-4">
            <Link
              href="/participants"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Apply to Be a Participant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/requestee"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Request a Focus Group
            </Link>
          </div>

          <p className="text-sm text-muted-foreground pt-4">
            Secure • Remote • Confidential
          </p>
        </div>
      </section>

      {/* What is a focus group */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What is a legal focus group?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            It&apos;s a practice run for a real case. Attorneys present their case — facts, arguments, evidence — to a panel of everyday people who reflect the jury they&apos;ll actually face. Then they listen. The reactions, doubts, and gut calls from that panel are gold before trial.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Real Texas jurors</h3>
            <p className="text-muted-foreground">
              Panels are built from everyday Texans — filtered by county, demographics, and case-relevant criteria.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Video className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">100% virtual</h3>
            <p className="text-muted-foreground">
              Every session runs over secure Zoom. No travel, no scheduling around courthouses — just a structured conversation online.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Honest, unfiltered</h3>
            <p className="text-muted-foreground">
              Participants share what they really think. Attorneys get the unvarnished feedback they need to sharpen the case.
            </p>
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="bg-secondary/50 py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What we do</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              We handle the logistics so attorneys can focus on the case and participants can focus on the conversation.
            </p>
          </div>

          <div className="grid gap-12 md:grid-cols-3">
            {[
              {
                icon: ClipboardList,
                title: "Recruit the right panel",
                desc: "We screen and verify participants, then match each case to jurors who fit the venire it would actually face in court.",
              },
              {
                icon: MessagesSquare,
                title: "Run structured sessions",
                desc: "We host the Zoom session, guide the discussion, and keep things on track so attorneys hear what they came to hear.",
              },
              {
                icon: Gavel,
                title: "Deliver usable feedback",
                desc: "Attorneys leave with concrete reactions they can act on. Participants leave paid for their time and perspective.",
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Two doors */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Which side are you on?</h2>
          <p className="mt-4 text-lg text-muted-foreground">Pick the path that fits — we&apos;ll walk you through the rest.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 max-w-5xl mx-auto">
          <Link
            href="/participants"
            className="group relative overflow-hidden rounded-2xl border bg-background p-10 transition-all hover:shadow-xl hover:border-primary/40"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">I want to join as a Participant</h3>
            <p className="text-muted-foreground mb-6">
              Share your honest opinion on real Texas cases — from home, on your schedule, and get paid for your time.
            </p>
            <span className="inline-flex items-center text-sm font-semibold text-primary">
              See how it works
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            href="/requestee"
            className="group relative overflow-hidden rounded-2xl border bg-background p-10 transition-all hover:shadow-xl hover:border-primary/40"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">I want to Request a Focus Group</h3>
            <p className="text-muted-foreground mb-6">
              Pressure-test your case with real Texas jurors before trial. Refine your argument with honest, structured feedback.
            </p>
            <span className="inline-flex items-center text-sm font-semibold text-primary">
              See how it works
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
