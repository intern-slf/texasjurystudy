"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowDown,
  Users,
  Briefcase,
  Clock,
  DollarSign,
  MapPin,
  Video,
} from "lucide-react";

export default function RequesteeLanding() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero — educational, no early signup CTA */}
      <section className="relative flex flex-col items-center justify-center py-20 text-center md:py-28 bg-gradient-to-b from-background to-secondary/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="space-y-6 max-w-4xl px-6">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium border-transparent bg-secondary text-secondary-foreground">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            For attorneys, mediators, arbitrators &amp; adjusters
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Test your case with a <br className="hidden md:block" />
            <span className="text-primary">virtual Texas jury.</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            Texas Jury Study is a virtual jury study service built for Texas litigation. Get unfiltered reactions from a cross-section of real Texans — at a fraction of the cost of a traditional jury consultant.
          </p>

          <div className="pt-2">
            <a
              href="#what-is-tjs"
              className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Learn how it works
              <ArrowDown className="ml-2 h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* What is Texas Jury Study? */}
      <section id="what-is-tjs" className="container mx-auto px-6 py-20 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">What is Texas Jury Study?</h2>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed">
            Texas Jury Study is a virtual jury study service for Texas litigation cases. We assemble panels of <strong className="text-foreground">6 to 12 participants</strong> drawn as a random cross-section of the Texas population — broadly reflective of the venires you&apos;d encounter across the state&apos;s 254 counties. Attorneys, mediators, arbitrators, and insurance adjusters use these panels to pressure-test their case before it matters.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold">6–12</div>
              <div className="text-sm text-muted-foreground">participants per panel</div>
            </div>
            <div className="rounded-xl border bg-background p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold">254</div>
              <div className="text-sm text-muted-foreground">Texas counties represented</div>
            </div>
            <div className="rounded-xl border bg-background p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Video className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold">Virtual</div>
              <div className="text-sm text-muted-foreground">secure Zoom sessions</div>
            </div>
          </div>
        </div>
      </section>

      {/* Who should submit a case? */}
      <section className="bg-secondary/40 py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="mb-10">
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Who should submit a case?</h2>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            If you work in the legal industry and have a case where juror perspective matters, this is for you. Our typical requestees include:
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { title: "Litigation & trial attorneys", desc: "Plaintiff- and defense-side counsel preparing for trial, mediation, or settlement." },
              { title: "Insurance companies & adjusters", desc: "Evaluating exposure and the likely jury response on disputed claims." },
              { title: "Mediators", desc: "Bringing data-driven perspective to the table before settlement discussions." },
              { title: "Arbitrators", desc: "Stress-testing how a panel of laypeople would react to the evidence at hand." },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border bg-background p-6">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Briefcase className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* When / at what stage? */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">When should you run a study?</h2>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            There&apos;s no single right moment — a study is useful at every stage of a case, and the best results often come from running more than one as the case develops.
          </p>

          <div className="space-y-4">
            {[
              { stage: "Intake phase", desc: "Decide whether to take the case, and at what value, before you commit resources." },
              { stage: "Throughout litigation", desc: "Re-evaluate strategy as new facts surface, motions are decided, and the record builds." },
              { stage: "Before & after depositions", desc: "Plan what to ask going in, and assess how the testimony actually lands coming out." },
              { stage: "Before trial", desc: "Test openings, themes, exhibits, and damages frameworks while there&apos;s still time to adjust." },
            ].map((item, i) => (
              <div key={i} className="flex gap-4 rounded-xl border bg-background p-5">
                <div className="flex-shrink-0 mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold">{item.stage}</h3>
                  <p className="text-muted-foreground text-sm mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-muted-foreground italic">
            Many of our requestees run studies multiple times on the same case — continuous re-evaluation is part of how good trial strategy is built.
          </p>
        </div>
      </section>

      {/* Cost */}
      <section className="bg-secondary/40 py-20">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="mb-10">
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Flexible, cost-effective pricing.</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-background p-8">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-primary uppercase tracking-wide">Texas Jury Study</div>
              <div className="mt-2 text-4xl font-extrabold">$850<span className="text-lg font-medium text-muted-foreground">/hour</span></div>
              <p className="text-muted-foreground text-sm mt-3">
                Starting price for virtual studies. In-person pricing is available and discussed separately based on your needs.
              </p>
            </div>

            <div className="rounded-2xl border bg-background p-8 opacity-90">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Traditional jury consultants</div>
              <div className="mt-2 text-4xl font-extrabold text-muted-foreground">$20K–$30K</div>
              <p className="text-muted-foreground text-sm mt-3">
                Typical cost for a comparable engagement with a traditional jury consultant — often out of reach for everyday cases.
              </p>
            </div>
          </div>

          <p className="mt-8 text-muted-foreground leading-relaxed">
            We built Texas Jury Study so that jury research isn&apos;t reserved for the biggest cases on the biggest dockets. Whether you need a single hour or an ongoing engagement, pricing scales to the case.
          </p>
        </div>
      </section>

      {/* How do I sign up? — final CTA */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">How do I sign up?</h2>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            If the service makes sense for your practice, the next step is to create a requestee account. From there you can submit your first case, share the materials you want the panel to consider, and we&apos;ll handle the rest.
          </p>

          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-2xl sm:px-16 md:py-16">
            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
              <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to submit a case?
              </h3>
              <p className="text-primary-foreground/80">
                Create your free requestee account — no commitment, and no charge until you actually run a study.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href="/auth/signup?role=requestee"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-background px-8 text-sm font-medium text-primary shadow transition-colors hover:bg-background/90"
                >
                  Create Requestee Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-primary-foreground/30 bg-transparent px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
                >
                  I already have an account
                </Link>
              </div>
            </div>
            <div className="absolute left-1/2 top-1/2 -z-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
          </div>
        </div>
      </section>
    </div>
  );
}
