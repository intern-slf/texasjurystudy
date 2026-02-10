import Link from "next/link";
import { ArrowRight, CheckCircle2, Gavel, Scale, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center py-20 text-center md:py-32 bg-gradient-to-b from-background to-secondary/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        
        <div className="space-y-6 max-w-5xl px-6">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            Now accepting new participants
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
            Influence the Course of <br className="hidden md:block" />
            <span className="text-primary">Justice from Home</span>
          </h1>
          
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            Join paid virtual focus groups for real legal cases. Your unbiased opinion helps lawyers and clients understand how juries think—all from the comfort of your home.
          </p>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row pt-4">
            <Link
              href="/auth/signup?role=participant"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              Join as Participant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            
            <Link
              href="/auth/signup?role=presenter"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              Run a Focus Group
            </Link>
          </div>
          
          <p className="text-sm text-muted-foreground pt-4">
            Secure • Anonymous • Paid Compensation
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-24">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Remote Participation</h3>
            <p className="text-muted-foreground">
              Participate deeply in important cases from the comfort of your home via protected Zoom sessions. No travel required.
            </p>
          </div>
          
          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Fair Compensation</h3>
            <p className="text-muted-foreground">
              We value your time. Receive competitive payment for your honest feedback and attention during case presentations.
            </p>
          </div>
          
          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gavel className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Real Impact</h3>
            <p className="text-muted-foreground">
              Help lawyers and clients understand how real juries think. Your perspective shapes the outcome of real trials.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-secondary/50 py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
            <p className="mt-4 text-lg text-muted-foreground">Simple steps to start contributing to the justice system.</p>
          </div>
          
          <div className="grid gap-12 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create an Account",
                desc: "Sign up in minutes. We'll ask a few demographic questions to match you with appropriate cases."
              },
              {
                step: "02",
                title: "Receive Invitations",
                desc: "Get notified via email when you're selected for a study that fits your profile."
              },
              {
                step: "03",
                title: "Join & Earn",
                desc: "Log in to the secure Zoom session, listen to the case, give feedback, and get paid."
              }
            ].map((item, i) => (
              <div key={i} className="relative flex flex-col items-center text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-xl">
                  {item.step}
                </div>
                <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground shadow-2xl sm:px-16 md:py-24">
          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Ready to make a difference?
            </h2>
            <p className="text-lg text-primary-foreground/80 md:text-xl">
              Join thousands of other participants in shaping the future of legal cases in Texas.
            </p>
            <div className="pt-4">
              <Link
                href="/auth/signup?role=participant"
                className="inline-flex h-12 items-center justify-center rounded-md bg-background px-8 text-sm font-medium text-primary shadow transition-colors hover:bg-background/90"
              >
                Get Started Now
              </Link>
            </div>
          </div>
          
          {/* Decorative circles */}
          <div className="absolute left-1/2 top-1/2 -z-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        </div>
      </section>
    </div>
  );
}
