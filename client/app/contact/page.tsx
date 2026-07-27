import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Mail,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  MAILING_ADDRESS,
  SUPPORT_EMAIL,
  LEGAL_ENTITY,
} from "@/lib/legal-constants";

export const metadata: Metadata = {
  title: "Contact | Texas Jury Study",
  description:
    "How to reach Texas Jury Study — support for participants, enquiries from attorneys and firms, and privacy or data requests.",
};

type Route = {
  icon: typeof Users;
  eyebrow: string;
  title: string;
  description: string;
  subject: string;
  link?: { href: string; label: string };
};

const ROUTES: Route[] = [
  {
    icon: Users,
    eyebrow: "For participants",
    title: "A question about a session, payment or your profile",
    description:
      "Session times, invitations you cannot open, a payment that has not arrived, updating your details, or anything about your account.",
    subject: "Participant support",
    link: { href: "/participants", label: "How participating works" },
  },
  {
    icon: Briefcase,
    eyebrow: "For attorneys and firms",
    title: "Request a focus group, or ask about pricing",
    description:
      "Scoping a study, panel composition, scheduling, pricing for a particular case, or a question about a case already submitted.",
    subject: "Focus group enquiry",
    link: { href: "/requestee", label: "How focus groups work" },
  },
  {
    icon: ShieldCheck,
    eyebrow: "Privacy",
    title: "Access, correct or delete your information",
    description:
      "Ask for a copy of what we hold on you, correct something wrong, request deletion, or appeal a decision we have made about a request.",
    subject: "Privacy rights request",
    link: { href: "/privacy#your-rights", label: "Your rights in full" },
  },
  {
    icon: MessageSquare,
    eyebrow: "Anything else",
    title: "General enquiries",
    description:
      "Press, partnerships, or anything that does not fit the categories above. If in doubt, use this one and we will route it.",
    subject: "General enquiry",
  },
];

function mailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl py-8 md:py-12">
      <header className="mb-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Mail className="h-3.5 w-3.5" />
          Contact
        </div>

        <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Get in touch
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Everything reaches the same inbox. Picking the closest match below
          just puts a useful subject line on your email so it gets to the right
          person faster.
        </p>

        <div className="mt-8 rounded-xl border bg-secondary/30 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email us
          </p>
          <a
            href={mailto("Enquiry")}
            className="mt-2 inline-flex items-center gap-2 text-xl font-bold tracking-tight text-foreground transition-colors hover:text-primary md:text-2xl"
          >
            {SUPPORT_EMAIL}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            We aim to reply within a few business days. Sessions run on a
            schedule, so if your message is about a session happening soon,
            please say so in the subject line.
          </p>
        </div>
      </header>

      <section aria-labelledby="routes-heading" className="scroll-mt-24">
        <h2 id="routes-heading" className="mb-6 text-2xl font-bold tracking-tight">
          What are you writing about?
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROUTES.map((route) => {
            const Icon = route.icon;

            return (
              <div
                key={route.subject}
                className="group flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {route.eyebrow}
                </div>

                <h3 className="mb-2 text-lg font-bold leading-snug tracking-tight">
                  {route.title}
                </h3>

                <p className="mb-6 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {route.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <a
                    href={mailto(route.subject)}
                    className="inline-flex items-center text-sm font-semibold text-primary"
                  >
                    Email us
                    <ArrowRight
                      className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </a>

                  {route.link ? (
                    <Link
                      href={route.link.href}
                      className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary"
                    >
                      {route.link.label}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="what-to-include-heading"
        className="mt-12 scroll-mt-24 rounded-xl border bg-secondary/30 p-6"
      >
        <h2
          id="what-to-include-heading"
          className="mb-4 text-xl font-bold tracking-tight"
        >
          What to include
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          You will get a faster answer if your first email covers:
        </p>
        <ul className="ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          <li>
            The email address on your account, if you have one. It is how we
            find you.
          </li>
          <li>
            Whether you are a participant or an attorney requesting a study.
          </li>
          <li>
            The session date or case title, if your question is about a specific
            one.
          </li>
          <li>
            For a payment question, the session date and the PayPal username on
            your profile.
          </li>
          <li>
            A screenshot of any error message, which usually saves a round trip.
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Please do not email your driver&rsquo;s license, or any other
          identity document, unless we have specifically asked you to. Upload it
          in the app instead, where it is stored privately.
        </p>
      </section>

      {MAILING_ADDRESS ? (
        <section
          aria-labelledby="post-heading"
          className="mt-12 scroll-mt-24 border-t pt-6"
        >
          <h2 id="post-heading" className="mb-2 text-base font-bold tracking-tight">
            By post
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {LEGAL_ENTITY}
            <br />
            {MAILING_ADDRESS}
          </p>
        </section>
      ) : null}

      <footer className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm">
        <Link
          href="/privacy"
          className="font-medium text-primary underline underline-offset-4"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="font-medium text-primary underline underline-offset-4"
        >
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
