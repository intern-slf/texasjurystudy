"use client";

import Link from "next/link";
import {
  ArrowRight,
  Gavel,
  Scale,
  Users,
  Video,
  ClipboardList,
  MessagesSquare,
  MapPin,
  ShieldCheck,
  Check,
  Sparkles,
} from "lucide-react";
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
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-secondary/10 to-background" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        {/* subtle grid */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="container mx-auto px-6 py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Virtual jury studies for Texas litigation
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-[1.05]">
              Real jurors.<br className="hidden md:block" />{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Real reactions.
              </span>{" "}
              <br className="hidden md:block" />
              Before trial.
            </h1>

            <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
              Texas Jury Study connects attorneys with everyday Texans in structured, virtual focus groups. Lawyers see how juries really think. Participants get paid for their honest opinion.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row pt-4">
              <Link
                href="/participants"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
              >
                Apply to Be a Participant
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>

              <Link
                href="/requestee"
                className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background/80 backdrop-blur px-8 text-sm font-semibold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5"
              >
                Request a Focus Group
              </Link>
            </div>

            <p className="text-sm text-muted-foreground pt-2 flex items-center justify-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Secure
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Video className="h-4 w-4 text-primary" /> Remote
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" /> Confidential
              </span>
            </p>
          </div>

          {/* Hero stats strip */}
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border bg-border">
              {[
                { value: "6–12", label: "jurors per panel" },
                { value: "254", label: "Texas counties" },
                { value: "100%", label: "virtual sessions" },
                { value: "Paid", label: "compensation for participants" },
              ].map((stat, i) => (
                <div key={i} className="bg-background px-6 py-6 text-center">
                  <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                  <div className="mt-1 text-xs md:text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What is a focus group */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            What is a <span className="text-primary">legal focus group?</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            It&apos;s a practice run for a real case. Attorneys present their case to a panel of everyday people who reflect the jury they&apos;ll actually face — then they listen. The reactions, doubts, and gut calls from that panel are gold before trial.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Real Texas jurors",
              desc: "Panels are built from everyday Texans — filtered by county, demographics, and case-relevant criteria.",
            },
            {
              icon: Video,
              title: "100% virtual",
              desc: "Every session runs over secure Zoom. No travel, no courthouse — just a structured conversation online.",
            },
            {
              icon: Scale,
              title: "Honest, unfiltered",
              desc: "Participants share what they really think. Attorneys get the unvarnished feedback they need to sharpen the case.",
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
                <div className="relative">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* What we do — numbered steps */}
      <section className="relative bg-secondary/40 py-24 overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="container mx-auto px-6">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              What we do
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              We handle the logistics.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Attorneys focus on the case. Participants focus on the conversation. We do the rest.
            </p>
          </div>

          <div className="relative grid gap-8 md:grid-cols-3">
            {/* desktop connector line */}
            <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

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
                  <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ring-8 ring-secondary/40">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="absolute top-0 right-1/2 translate-x-12 -translate-y-2 text-5xl font-black text-primary/10 select-none">
                    0{i + 1}
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xs">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust band */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {[
            {
              icon: MapPin,
              title: "Built for Texas",
              desc: "Panels reflect the venires you actually face — across all 254 counties.",
            },
            {
              icon: Sparkles,
              title: "Accessible to every case",
              desc: "Jury research shouldn't be reserved for the biggest dockets — our model brings it within reach of everyday litigation.",
            },
            {
              icon: ShieldCheck,
              title: "Confidential by design",
              desc: "Case materials and participant identities are protected by default.",
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex gap-4 items-start">
                <div className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two doors */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Which side are you on?
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Pick the path that fits — we&apos;ll walk you through the rest.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 max-w-5xl mx-auto">
          {/* Participant card */}
          <Link
            href="/participants"
            className="group relative overflow-hidden rounded-3xl border bg-background p-8 md:p-10 transition-all hover:shadow-2xl hover:border-primary/40 hover:-translate-y-1"
          >
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 transition-all group-hover:scale-125 group-hover:bg-primary/10" />

            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                <Users className="h-3.5 w-3.5" />
                For Texans
              </div>

              <h3 className="mb-3 text-2xl md:text-3xl font-bold leading-tight">
                Join as a Participant
              </h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Share your honest opinion on real Texas cases — from home, on your schedule, and get paid for your time.
              </p>

              <ul className="space-y-2.5 mb-8">
                {[
                  "Paid sessions, 100% remote",
                  "No legal background needed",
                  "Anonymous & confidential",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <span className="inline-flex items-center text-sm font-semibold text-primary">
                See how it works
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          {/* Requestee card */}
          <Link
            href="/requestee"
            className="group relative overflow-hidden rounded-3xl border bg-foreground/[0.02] p-8 md:p-10 transition-all hover:shadow-2xl hover:border-primary/40 hover:-translate-y-1"
          >
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 transition-all group-hover:scale-125 group-hover:bg-primary/10" />

            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                <Scale className="h-3.5 w-3.5" />
                For Legal Professionals
              </div>

              <h3 className="mb-3 text-2xl md:text-3xl font-bold leading-tight">
                Request a Focus Group
              </h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Pressure-test your case with real Texas jurors before trial. Refine your argument with honest, structured feedback.
              </p>

              <ul className="space-y-2.5 mb-8">
                {[
                  "Flexible, cost-effective pricing",
                  "Useful at every stage of litigation",
                  "Built for attorneys, mediators & adjusters",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <span className="inline-flex items-center text-sm font-semibold text-primary">
                See how it works
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
