import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

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
  title: "Privacy Policy | Texas Jury Study",
  description:
    "What personal information Texas Jury Study collects from participants and attorneys, how it is used and shared, and how to exercise your privacy rights under Texas law.",
};

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const DataGroup = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-sm font-semibold text-foreground">{label}</p>
    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  </div>
);

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "1. Who we are and what this covers",
    body: (
      <>
        <p>
          {LEGAL_ENTITY} runs paid, virtual focus groups for Texas litigation.
          Two very different groups of people use the service, and we collect
          very different information from each:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="font-semibold text-foreground">
              Participants
            </strong>{" "}
            &mdash; Texas residents who join paid online sessions and give their
            honest reactions to a case.
          </li>
          <li>
            <strong className="font-semibold text-foreground">
              Attorneys and firms
            </strong>{" "}
            &mdash; the legal professionals who request a focus group. We refer
            to them as <em>requestees</em> in some parts of the product.
          </li>
        </ul>
        <p>
          This policy explains what we collect from each group, what we do with
          it, who else sees it, and the rights you have under Texas law. It
          applies to this website and to the sessions we run.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. Information we collect",
    body: (
      <>
        <h3 className="text-base font-semibold text-foreground">
          If you sign up as a participant
        </h3>
        <p>
          Participating means being screened for a jury-style panel, so the
          sign-up form is detailed. We collect:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DataGroup label="Identity and contact">
            First and last name, email address, phone number and date of birth.
          </DataGroup>
          <DataGroup label="Address">
            Street address, second address line, city, county, state, ZIP code
            and country.
          </DataGroup>
          <DataGroup label="Demographics">
            Gender, race, marital status, whether you have children, education
            level, family income range, industry, employment status and
            political affiliation.
          </DataGroup>
          <DataGroup label="Juror eligibility">
            US citizenship, whether you have a felony conviction, whether you
            have served on a jury before, and whether you have served in the
            armed forces.
          </DataGroup>
          <DataGroup label="Identity verification">
            Your driver&rsquo;s license number and an image of your
            driver&rsquo;s license.
          </DataGroup>
          <DataGroup label="Payment details">
            Your PayPal username, so we can pay you after a session.
          </DataGroup>
          <DataGroup label="Availability">
            Whether you are available on weekdays, weekends, or both.
          </DataGroup>
          <DataGroup label="Account and history">
            Your login credentials, session invitations and your responses to
            them, attendance record, and how you heard about us.
          </DataGroup>
        </div>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          If you request a focus group
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <DataGroup label="Account">
            Your name, email address and login credentials.
          </DataGroup>
          <DataGroup label="Case information">
            Case titles, descriptions, the panel criteria you select, and
            requested dates.
          </DataGroup>
          <DataGroup label="Case materials">
            Documents you upload and any Google Drive links you share with us.
          </DataGroup>
          <DataGroup label="Confidentiality agreement">
            Your electronic signature and the date you signed.
          </DataGroup>
        </div>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Collected automatically
        </h3>
        <p>
          Standard server logs generated when you use the site, and the
          authentication cookies described in{" "}
          <a
            href="#cookies"
            className="font-medium text-primary underline underline-offset-4"
          >
            section 8
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "sensitive-information",
    title: "3. Sensitive information, and why we ask for it",
    body: (
      <>
        <p>
          Texas law treats some of what we collect as{" "}
          <strong className="font-semibold text-foreground">
            sensitive personal data
          </strong>
          , which we may only process with your consent. Two categories on our
          sign-up form fall into that bucket:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="font-semibold text-foreground">Race.</strong> A
            focus group is only useful if the panel reflects the jury pool an
            attorney would actually face, so attorneys can request a panel with
            a particular demographic mix.
          </li>
          <li>
            <strong className="font-semibold text-foreground">
              Citizenship status.
            </strong>{" "}
            Only US citizens are eligible to serve on a jury in Texas, so we ask
            in order to screen for a realistic panel.
          </li>
        </ul>
        <p>
          By submitting the participant sign-up form you consent to us
          processing this information for those purposes. You can withdraw that
          consent at any time by emailing us, though doing so means we can no
          longer invite you to sessions.
        </p>
        <p>
          Your driver&rsquo;s license number and license image are held for one
          reason only: to confirm that a participant is a real, unique person
          before we pay them. We do not use license images to build a facial
          template or any other biometric identifier, and we do not run them
          through facial-recognition software.
        </p>
      </>
    ),
  },
  {
    id: "recordings",
    title: "4. Sessions are recorded",
    body: (
      <>
        <p>
          Focus-group sessions run over Zoom and{" "}
          <strong className="font-semibold text-foreground">
            are recorded in full
          </strong>
          . The recording is provided to the attorney or firm that requested the
          session, and one observer from that firm may also attend live in a
          silent capacity.
        </p>
        <p>
          That means your voice, your image if your camera is on, and everything
          you say during a session are captured and shared with the requesting
          firm. If you are not comfortable with that, please do not accept a
          session invitation.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "5. How we use your information",
    body: (
      <>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>To create and administer your account.</li>
          <li>
            To match participants to a requested panel using the demographic and
            eligibility criteria above.
          </li>
          <li>
            To invite participants to sessions, and to send reminders and
            follow-ups.
          </li>
          <li>To run sessions and deliver results to the requesting firm.</li>
          <li>To verify identity and pay participants.</li>
          <li>
            To operate the strike and eligibility rules described in our{" "}
            <Link
              href="/terms"
              className="font-medium text-primary underline underline-offset-4"
            >
              Terms of Service
            </Link>
            .
          </li>
          <li>
            To keep the service secure, prevent fraud and duplicate accounts,
            and meet our legal, accounting and tax obligations.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "who-sees-it",
    title: "6. Who sees your information",
    body: (
      <>
        <h3 className="text-base font-semibold text-foreground">
          What attorneys can and cannot see
        </h3>
        <p>
          This is the most important thing on this page for participants.
          Attorneys who request a focus group see participants only as a{" "}
          <strong className="font-semibold text-foreground">
            demographic profile
          </strong>{" "}
          &mdash; gender, race, county, age bracket, education level and
          political affiliation.
        </p>
        <p>
          They do{" "}
          <strong className="font-semibold text-foreground">not</strong> receive
          your name, email address, phone number, home address, date of birth,
          driver&rsquo;s license number, license image or PayPal username. This
          separation is enforced in the database itself through row-level
          security rules, not just in the interface. Note that attorneys and
          their observer do see and hear you during the session itself and in
          the recording.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Our staff
        </h3>
        <p>
          Administrators at {LEGAL_ENTITY} can see participant records in full,
          because they verify identities, approve accounts, arrange sessions and
          issue payments. Participants can see their own record and nobody
          else&rsquo;s.
        </p>

        <h3 className="pt-2 text-base font-semibold text-foreground">
          Service providers
        </h3>
        <p>
          We use a small number of vendors to run the service. They process data
          on our behalf, for our purposes only:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DataGroup label="Supabase">
            Our database, login system and encrypted file storage. Holds
            everything described in section 2.
          </DataGroup>
          <DataGroup label="Vercel">
            Hosts the website and processes standard request logs.
          </DataGroup>
          <DataGroup label="Zoom">
            Runs and records the live sessions.
          </DataGroup>
          <DataGroup label="PayPal">
            Receives the payment we send to the username on your profile.
          </DataGroup>
          <DataGroup label="Email delivery">
            Sends invitations, reminders, password resets and other
            transactional email to your address.
          </DataGroup>
          <DataGroup label="ZIP code lookup">
            When you type a ZIP code at sign-up we send just that ZIP code to
            two public lookup services, Zippopotam.us and the FCC area API, to
            fill in your state and county. No other information is sent.
          </DataGroup>
        </div>
        <p>
          We may also disclose information if the law requires it, to enforce
          our terms, or to protect someone&rsquo;s safety or our legal rights.
        </p>
      </>
    ),
  },
  {
    id: "what-we-dont-do",
    title: "7. What we do not do",
    body: (
      <>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>We do not sell your personal information.</li>
          <li>
            We do not share it with data brokers or use it for targeted
            advertising.
          </li>
          <li>We do not run advertising or cross-site tracking on this site.</li>
          <li>
            We do not use your information to make automated decisions that
            produce legal effects about you.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "cookies",
    title: "8. Cookies",
    body: (
      <>
        <p>
          We use cookies for one thing: keeping you logged in. These are
          authentication cookies set by our login provider, Supabase, and they
          are strictly necessary for the site to work. Clearing them logs you
          out.
        </p>
        <p>
          There are no advertising cookies, no analytics cookies and no
          third-party tracking pixels on this site.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "9. How we protect it",
    body: (
      <>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Traffic to and from the site is encrypted in transit (HTTPS).</li>
          <li>
            Access to every table in our database is restricted by row-level
            security rules tied to your role, so the database refuses queries
            for records you are not entitled to see.
          </li>
          <li>
            Driver&rsquo;s license images and case documents live in private
            storage that is not publicly reachable. They are opened through
            short-lived, single-use links generated only for someone already
            authorised to view them.
          </li>
          <li>Passwords are hashed by our authentication provider.</li>
          <li>
            Administrative access is limited to the {LEGAL_ENTITY} staff who
            need it.
          </li>
        </ul>
        <p>
          No system is perfectly secure, and we will not pretend otherwise. If a
          breach affects your sensitive personal information we will notify you
          and the relevant Texas authorities as required by law.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "10. How long we keep it, and how to have it deleted",
    body: (
      <>
        <p>
          We keep your information for as long as your account is active. If you
          stop participating we keep your record so that we do not re-invite
          someone who has asked to be left alone and so that we retain proof of
          payments made.
        </p>
        <p>
          There is currently no self-service delete button in the app. To have
          your account and personal information deleted, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Data%20deletion%20request`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          and we will handle it manually.
        </p>
        <p>
          Two things survive a deletion request. We keep records of payments for
          as long as tax and accounting law requires, and we keep a minimal note
          of accounts removed for conduct reasons so the same person cannot
          immediately sign up again. Session recordings already delivered to a
          requesting firm are in that firm&rsquo;s hands and are governed by the
          confidentiality agreement they signed.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "11. Your privacy rights in Texas",
    body: (
      <>
        <p>
          If you are a Texas resident, the Texas Data Privacy and Security Act
          gives you the right to:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Confirm whether we are processing your personal data, and see it.</li>
          <li>Correct anything inaccurate.</li>
          <li>Have your personal data deleted.</li>
          <li>
            Obtain a portable copy of the data you provided to us, in a readable
            format.
          </li>
          <li>
            Opt out of the sale of your personal data, targeted advertising and
            profiling. As set out in section 7, we do not do any of those
            things.
          </li>
        </ul>
        <p>
          To exercise any of these, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20rights%20request`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          . We will respond within 45 days. If the request is complicated we may
          take one further 45 days, and we will tell you before we do.
        </p>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            If we say no, you can appeal
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Reply to our decision within a reasonable time and tell us you are
            appealing. A different person will review it, and we will give you a
            written answer within 60 days. If we still refuse, we will explain
            how to complain to the Texas Attorney General, who accepts consumer
            complaints at texasattorneygeneral.gov.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "children",
    title: "12. Children",
    body: (
      <p>
        This service is for adults. You must be 18 or older to create an
        account, and we do not knowingly collect information from anyone under
        18. If you believe a child has given us information, email us and we
        will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "13. Changes to this policy",
    body: (
      <p>
        If we change this policy we will update the &ldquo;last updated&rdquo;
        date at the top of this page. If the change materially affects how we
        handle your information, we will email registered users rather than rely
        on you noticing.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. How to reach us",
    body: (
      <>
        <p>
          Questions about this policy, or about anything we hold on you, go to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20question`}
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
          There is more on how to get in touch, including what to include in
          your message, on our{" "}
          <Link
            href="/contact"
            className="font-medium text-primary underline underline-offset-4"
          >
            contact page
          </Link>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl py-8 md:py-12">
      <BackButton href="/" label="Back to Home" className="mb-6" />

      <header className="mb-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          Privacy
        </div>

        <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Privacy Policy
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          We ask participants for a lot of personal information, including a
          driver&rsquo;s license. This page explains exactly what we collect,
          who sees it, and what we will never do with it.
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

      <nav aria-labelledby="toc-heading" className="mb-12 rounded-xl border bg-secondary/30 p-5">
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
          href="/terms"
          className="font-medium text-primary underline underline-offset-4"
        >
          Terms of Service
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
