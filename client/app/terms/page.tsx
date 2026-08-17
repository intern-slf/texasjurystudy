import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";

import BackButton from "@/components/BackButton";
import {
  EFFECTIVE_DATE,
  LAST_UPDATED,
  LEGAL_ENTITY,
  MAILING_ADDRESS,
  SUPPORT_EMAIL,
  formatLegalDate,
} from "@/lib/legal-constants";

export const metadata: Metadata = {
  title: "Terms of Service | Texas Jury Study",
  description:
    "The terms that govern use of Texas Jury Study, for both focus-group participants and the attorneys and firms who request a study.",
};

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const Callout = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
    <p className="text-sm font-semibold text-foreground">{label}</p>
    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  </div>
);

const SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "1. Agreeing to these terms",
    body: (
      <>
        <p>
          These terms are an agreement between you and {LEGAL_ENTITY}. By
          creating an account, joining a session or requesting a focus group,
          you accept them. If you do not accept them, do not use the service.
        </p>
        <p>
          Two groups use this platform and their obligations are different, so
          this document is split accordingly. Throughout, a{" "}
          <strong className="font-semibold text-foreground">participant</strong>{" "}
          is someone who joins a paid session as a mock juror, and a{" "}
          <strong className="font-semibold text-foreground">requestee</strong>{" "}
          is the attorney, firm, mediator or adjuster who requests the study.
          Sections 4 and 5 apply to one group each. Every other section applies
          to everybody.
        </p>
        <p>
          Separately from these terms, both groups sign a short confidentiality
          agreement inside the app before reaching a dashboard. That agreement
          stands on its own and these terms are meant to sit alongside it, not
          replace it.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "2. Who may use the service",
    body: (
      <>
        <p>You must be at least 18 years old to use this service.</p>
        <p>
          Participants must additionally be residents of Texas, because the
          whole point of the panel is to reflect a Texas jury pool.
        </p>
        <p>
          Jury service in Texas has statutory eligibility requirements, and our
          panels mirror them. When you complete the participant sign-up form,
          your account is automatically marked ineligible for future sessions if
          you indicate that you are not a US citizen or that you have a felony
          conviction. This is not a judgement about you; it is how we keep the
          panel representative of people who could actually be seated on a jury.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. Your account",
    body: (
      <>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Give us accurate information and keep it current. Much of what we
            ask for determines which sessions you are matched to, so wrong
            answers waste everyone&rsquo;s time.
          </li>
          <li>
            One account per person. Duplicate accounts may be removed, and
            duplicates created to collect more than one payment for the same
            session will be treated as fraud.
          </li>
          <li>
            Keep your password to yourself. You are responsible for activity
            under your account.
          </li>
          <li>
            Tell us promptly at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Account%20security`}
              className="font-medium text-primary underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            if you think someone else has access to your account.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "participants",
    title: "4. If you are a participant",
    body: (
      <>
        <h3 className="text-base font-semibold text-foreground">
          Showing up matters
        </h3>
        <p>
          Sessions are built around a fixed panel size. When someone accepts an
          invitation and then does not appear, the study is compromised for
          everyone. So accepting an invitation is a commitment.
        </p>
        <Callout label="Three strikes">
          If you accept an invitation and then back out, that is recorded as a
          strike against your account. At three strikes your account is
          automatically blacklisted and you will not be invited to any further
          sessions. If you genuinely cannot make a session, decline the
          invitation, or tell us as early as you can.
        </Callout>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Confidentiality
        </h3>
        <p>
          Everything you see and hear in a session is confidential and for
          private use only. You agree not to discuss, publish, post or share any
          case, document, argument or discussion from a session with anyone
          outside it.
        </p>
        <p>
          You also acknowledge something with real legal consequence: by taking
          part, you are disqualified from serving as a juror in any case
          discussed during a session. If you are ever summoned for jury duty on
          a matter you recognise from one of our sessions, you must disclose
          your participation to the court.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Recording
        </h3>
        <p>
          Sessions are recorded in full and the recording is given to the
          requesting firm. One observer from that firm may also attend live
          without speaking. By joining a session you consent to being recorded
          on that basis. You may not make your own recording of a session, or
          screenshot, copy or redistribute any material shown to you.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Getting paid
        </h3>
        <p>
          Participation is paid. The amount offered for a given session is
          stated in the invitation you receive; payment is sent to the PayPal
          username on your profile after the session, provided you attended and
          took part properly. Keep that username accurate, because we cannot pay
          you if it is wrong.
        </p>
        <p>
          Payments are made to you as an independent participant, not as an
          employee. You are responsible for any tax you owe on them, and we may
          need tax information from you before paying if your total payments
          reach the threshold at which reporting is required.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Give us your honest opinion
        </h3>
        <p>
          The entire value of the exercise is candour. Do not research the case
          outside the session, do not coordinate your answers with other
          participants, and do not tell us what you think an attorney wants to
          hear. There are no right answers.
        </p>
      </>
    ),
  },
  {
    id: "requestees",
    title: "5. If you are an attorney or firm requesting a study",
    body: (
      <>
        <h3 className="text-base font-semibold text-foreground">Fees</h3>
        <p>
          Studies are priced at{" "}
          <strong className="font-semibold text-foreground">
            $850 per hour
          </strong>{" "}
          of session time, plus{" "}
          <strong className="font-semibold text-foreground">$100</strong> for
          each demographic or eligibility filter you apply to narrow the panel.
          The app shows you a full breakdown before you confirm a case, and that
          breakdown is the quote. Payment arrangements are handled directly with
          our team.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          What a focus group is, and is not
        </h3>
        <Callout label="No attorney-client relationship, no prediction of outcome">
          {LEGAL_ENTITY} is a research service. Using it does not create an
          attorney-client relationship between you and us, and nothing we give
          you is legal advice. Focus-group feedback tells you how one small
          group of people reacted on one day. It is not a prediction of how a
          real jury will decide your case, and you should not rely on it as one.
        </Callout>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Materials you upload
        </h3>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            You confirm you have the right to share everything you upload or
            link to, and that doing so breaches no court order, protective
            order, sealing order or duty you owe to anyone.
          </li>
          <li>
            You are responsible for redacting privileged material and anything
            you are not permitted to disclose. We do not review your uploads for
            privilege, and we cannot un-see material once a panel has seen it.
          </li>
          <li>
            You keep ownership of your materials. You grant us a limited licence
            to store them and show them to participants and staff purely in
            order to run your study.
          </li>
        </ul>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Confidentiality on your side
        </h3>
        <p>
          All materials, discussions, participant responses and outcomes tied to
          a study are confidential. You agree not to record, distribute,
          disclose or reuse anything from a session outside the scope of the
          study, and to keep the recording we provide within your firm and its
          client for that matter.
        </p>
        <p>
          Participants are real people who gave us sensitive personal
          information on the understanding that you would never see it. You must
          not attempt to identify, contact or research any participant, and you
          must not use anything from a session to their detriment.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Scheduling and approval
        </h3>
        <p>
          Cases are submitted for review and we may approve, decline or ask you
          to change a request. Session dates are proposed and confirmed through
          the app. We may need to reschedule if too few eligible participants
          are available, and we will tell you as soon as we know.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Things nobody may do",
    body: (
      <ul className="ml-5 list-disc space-y-1.5">
        <li>Impersonate anyone, or give false information at sign-up.</li>
        <li>
          Try to access records belonging to another user, or probe, scan or
          test the security of the platform.
        </li>
        <li>
          Scrape, bulk-download or reverse-engineer any part of the service.
        </li>
        <li>
          Harass, threaten or discriminate against another user or a member of
          staff, during a session or otherwise.
        </li>
        <li>Upload malware, or anything unlawful.</li>
        <li>
          Use the service to gather information about jurors, parties or
          witnesses in an actual pending case.
        </li>
      </ul>
    ),
  },
  {
    id: "intellectual-property",
    title: "7. Intellectual property",
    body: (
      <p>
        The platform itself &mdash; the software, design, text and branding
        &mdash; belongs to {LEGAL_ENTITY}. These terms give you permission to
        use it for its intended purpose and nothing more. Case materials remain
        the property of whoever uploaded them, as set out in section 5.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "8. Disclaimers",
    body: (
      <>
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. To the fullest extent the law allows, we
          disclaim all implied warranties, including merchantability, fitness
          for a particular purpose and non-infringement.
        </p>
        <p>We do not guarantee that:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>the service will be uninterrupted or error-free;</li>
          <li>
            a session will produce a panel of any particular size or exact
            demographic composition, since it depends on who is available and
            accepts;
          </li>
          <li>
            focus-group results correlate with the outcome of any real
            proceeding.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "liability",
    title: "9. Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent permitted by Texas law, {LEGAL_ENTITY} is not
          liable for indirect, incidental, special, consequential or punitive
          damages, or for lost profits, lost business or the outcome of any
          legal matter, arising from your use of the service.
        </p>
        <p>
          Our total liability for any claim relating to the service is limited
          to the amount you paid us, or we paid you, in the twelve months before
          the claim arose.
        </p>
        <p>
          Nothing here limits liability that cannot lawfully be limited,
          including liability for fraud.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "10. Indemnity",
    body: (
      <p>
        You agree to indemnify {LEGAL_ENTITY} against claims, losses and
        reasonable legal costs arising from your breach of these terms, your
        breach of the confidentiality agreement you signed, or &mdash; for
        requestees &mdash; from the materials you uploaded, including any claim
        that sharing them was not yours to authorise.
      </p>
    ),
  },
  {
    id: "termination",
    title: "11. Suspension and termination",
    body: (
      <>
        <p>
          You may stop using the service at any time and ask us to close your
          account by emailing{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Close%20my%20account`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p>
          We may suspend or close an account that breaches these terms,
          reaches the strike limit in section 4, is ineligible under section 2,
          or that we reasonably believe is fraudulent. Where the reason is
          administrative rather than serious misconduct we will normally tell
          you why.
        </p>
        <p>
          Confidentiality obligations, the juror-disqualification acknowledgement
          in section 4, and sections 7 through 10 survive the end of your
          account.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "12. Changes to these terms",
    body: (
      <p>
        We may update these terms. If a change materially affects your rights or
        obligations we will email registered users and update the &ldquo;last
        updated&rdquo; date above, rather than relying on you to re-read this
        page. Continuing to use the service after a change means you accept it.
        If you do not, close your account.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "13. Governing law",
    body: (
      <p>
        These terms are governed by the laws of the State of Texas, without
        regard to its conflict-of-laws rules. Any dispute will be brought in the
        state or federal courts located in Texas, and both sides consent to
        those courts.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. How to reach us",
    body: (
      <>
        <p>
          Questions about these terms go to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Question%20about%20the%20Terms%20of%20Service`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        {MAILING_ADDRESS ? (
          <p>
            You can also write to us at:
            <br />
            <span className="text-foreground">{MAILING_ADDRESS}</span>
          </p>
        ) : null}
        <p>
          How we handle the information you give us is covered separately in our{" "}
          <Link
            href="/privacy"
            className="font-medium text-primary underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl py-8 md:py-12">
      <BackButton href="/" label="Back to Home" className="mb-6" />

      <header className="mb-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Scale className="h-3.5 w-3.5" />
          Terms
        </div>

        <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Terms of Service
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Participants and attorneys use this platform for opposite reasons, so
          their obligations differ. Section 4 covers participants, section 5
          covers attorneys, and the rest applies to everyone.
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t pt-5 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Effective</dt>
            <dd className="font-medium text-foreground">
              {formatLegalDate(EFFECTIVE_DATE)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Last updated</dt>
            <dd className="font-medium text-foreground">
              {formatLegalDate(LAST_UPDATED)}
            </dd>
          </div>
        </dl>
      </header>

      <nav
        aria-labelledby="toc-heading"
        className="mb-12 rounded-xl border bg-secondary/30 p-5"
      >
        <h2
          id="toc-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          On this page
        </h2>
        <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="scroll-mt-24"
          >
            <h2
              id={`${section.id}-heading`}
              className="mb-4 text-2xl font-bold tracking-tight"
            >
              {section.title}
            </h2>
            <div className="space-y-4 leading-relaxed text-muted-foreground">
              {section.body}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm">
        <Link
          href="/privacy"
          className="font-medium text-primary underline underline-offset-4"
        >
          Privacy Policy
        </Link>
        <Link
          href="/contact"
          className="font-medium text-primary underline underline-offset-4"
        >
          Contact
        </Link>
      </footer>
    </div>
  );
}
