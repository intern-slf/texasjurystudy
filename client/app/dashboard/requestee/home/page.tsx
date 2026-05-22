"use client";

import Link from "next/link";
import RequesteeSidebar from "@/components/RequesteeSidebar";
import {
  ArrowRight,
  Play,
  MapPin,
  Lightbulb,
  BookOpen,
  Clock,
  Users,
  Mic,
  CalendarDays,
  Eye,
  Receipt,
  Phone,
  Mail,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { FOCUS_GROUP_VIDEOS } from "@/lib/focus-group-videos";

function VideoPlayer({ url, label }: { url: string; label?: string }) {
  if (!url) {
    return (
      <div className="aspect-video w-full bg-slate-900 rounded-md flex flex-col items-center justify-center relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Play className="w-5 h-5 text-white/60 ml-0.5" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-white/50 font-semibold mb-1">
            Video forthcoming
          </span>
          {label && (
            <span className="text-sm text-white/70 font-medium mt-1 max-w-xs">
              {label}
            </span>
          )}
        </div>
      </div>
    );
  }
  const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loomMatch) {
    return (
      <div className="aspect-video bg-slate-900 rounded-md w-full overflow-hidden">
        <iframe
          src={`https://www.loom.com/embed/${loomMatch[1]}`}
          allow="fullscreen"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }
  return (
    <video
      src={url}
      controls
      controlsList="nodownload"
      className="aspect-video bg-slate-900 rounded-md w-full object-cover"
    />
  );
}

function VideoCard({
  url,
  caption,
  label,
}: {
  url: string;
  caption?: string;
  label?: string;
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-white/85">
          {caption || "Video"}
        </p>
      </div>
      <div className="p-3 bg-slate-50">
        <VideoPlayer url={url} label={label} />
      </div>
    </div>
  );
}

type Section = {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  body: React.ReactNode;
  videoUrl: string;
  videoCaption: string;
  videoLabel: string;
};

const sections: Section[] = [
  {
    id: "purpose",
    title: "Things to consider",
    subtitle: "Identifying the objective of your focus group.",
    icon: Lightbulb,
    body: (
      <div className="space-y-4">
        <p>
          Every case is different, and so is every focus group. Before submitting, consider what you
          most need feedback on. Common objectives include:
        </p>
        <ul className="space-y-2.5">
          {[
            { k: "Liability", v: "Whether the underlying narrative is persuasive." },
            { k: "Damages", v: "How representative Texans value the harm in question." },
            { k: "Opening statement", v: "Audience reaction to your delivery and framing." },
            { k: "Deposition clips", v: "Credibility and impact of witness testimony." },
            { k: "Demonstrative aids", v: "Whether your visuals communicate as intended." },
          ].map((item) => (
            <li key={item.k} className="flex gap-3">
              <CheckCircle2 className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold text-slate-900">{item.k}</span>
                <span className="text-slate-600"> — {item.v}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-slate-600">
          Specify your area of focus on the submission form, and the session will be tailored
          accordingly.
        </p>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Tailoring your focus group",
    videoLabel: "Selecting the objective of your session",
  },
  {
    id: "most-common",
    title: "Most common format",
    subtitle: "The narrative focus group.",
    icon: BookOpen,
    body: (
      <div className="space-y-4">
        <p>
          The narrative format begins with a neutral, objective statement of the facts. The audience is
          then walked through the central issues of the case.
        </p>
        <p>
          Participants share reactions as the narrative develops — identifying what is persuasive, what
          is unclear, and what they would award. It is the format most attorneys begin with.
        </p>
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5">
          Recommended for first-time submissions
        </div>
      </div>
    ),
    videoUrl: FOCUS_GROUP_VIDEOS.narrative[0]?.url ?? "",
    videoCaption: "Narrative focus group",
    videoLabel: FOCUS_GROUP_VIDEOS.narrative[0]?.question ?? "Narrative focus group overview",
  },
  {
    id: "time",
    title: "How much time should be requested?",
    subtitle: "The average session is one hour. Adjust based on case stage.",
    icon: Clock,
    body: (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-slate-900">1 hour</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">
                Standard
              </span>
            </div>
            <p className="text-sm text-slate-600">
              The default session length, suitable for most attorneys testing a focused question.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-slate-900">3 hours</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">
                Near trial
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Recommended when trial is imminent and the full case must be evaluated in a single sitting.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Early-stage cases:</span> we recommend
            splitting the matter into two one-hour sessions — one focused on liability, the other on
            damages — to produce cleaner feedback on each.
          </p>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Selecting session length",
    videoLabel: "One hour, three hour, and split-session formats",
  },
  {
    id: "participants",
    title: "How are participants selected?",
    subtitle: "A random cross-section of Texas, with optional demographic targeting.",
    icon: Users,
    body: (
      <div className="space-y-4">
        <p>
          Every panel is drawn as a{" "}
          <span className="font-semibold text-slate-900">random cross-section of Texans</span> —
          comparable to the composition of a jury venire.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="shrink-0 h-9 w-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">County demographic match</p>
              <p className="text-sm text-slate-600">
                Participants may be selected whose demographics mirror the venue county of your case.
                A modest upcharge applies and is disclosed at submission.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 h-9 w-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
              <Users className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Ideological composition</p>
              <p className="text-sm text-slate-600">
                A predominantly <span className="font-medium">conservative</span> or{" "}
                <span className="font-medium">liberal</span> panel may be requested where appropriate
                for the case.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Participant selection",
    videoLabel: "Random sampling and demographic targeting",
  },
  {
    id: "presenter",
    title: "Who presents the case?",
    subtitle: "A TJS-trained presenter by default. Self-presentation is permitted.",
    icon: Mic,
    body: (
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Standard
            </p>
          </div>
          <div className="p-4">
            <p className="font-semibold text-slate-900 mb-1">TJS presenter</p>
            <p className="text-sm text-slate-600">
              A trained, experienced Texas Jury Study presenter delivers the case on your behalf. This
              is the recommended option and the one most attorneys select.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Alternative
            </p>
          </div>
          <div className="p-4">
            <p className="font-semibold text-slate-900 mb-1">Self-presentation</p>
            <p className="text-sm text-slate-600">
              Permitted if you prefer to present personally. Not recommended unless you have
              substantial experience presenting to lay audiences. Arrangements should be made by
              emailing the TJS team directly.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-slate-600 shrink-0" />
          <span>
            <span className="font-semibold text-slate-900">Pricing is identical</span> regardless of
            which option is selected.
          </span>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Presentation of the case",
    videoLabel: "TJS presenter and self-presentation options",
  },
  {
    id: "timing",
    title: "When will the session be conducted?",
    subtitle: "Most sessions are held within a few days of approval.",
    icon: CalendarDays,
    body: (
      <div className="space-y-4">
        <p>
          Once a case is approved, the session is usually scheduled within a few days. Exact timing
          depends on jury availability and how busy the calendar is that week.
        </p>
        <p>
          You select a preferred timeframe when submitting the case. After our team reviews it, we
          confirm the final date with you by email.
        </p>
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="h-10 w-10 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">From approval to session</p>
            <p className="text-sm text-slate-600">Usually a few business days, depending on the calendar.</p>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Scheduling and lead time",
    videoLabel: "From submission to session",
  },
  {
    id: "observers",
    title: "Observers",
    subtitle: "Optional. The majority of attorneys do not attend live.",
    icon: Eye,
    body: (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-slate-600" />
              <p className="font-semibold text-slate-900 text-sm">One observer per session</p>
            </div>
            <p className="text-sm text-slate-600">
              A single observer is permitted to attend the live session in a silent capacity.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-4 w-4 text-slate-600" />
              <p className="font-semibold text-slate-900 text-sm">Recording provided</p>
            </div>
            <p className="text-sm text-slate-600">
              Most clients elect not to attend live and instead review the full recording at their
              convenience.
            </p>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Observers and live attendance",
    videoLabel: "Attending live versus reviewing the recording",
  },
  {
    id: "fee",
    title: "What is included in the fee?",
    subtitle: "All deliverables required to act on the results.",
    icon: Receipt,
    body: (
      <div className="space-y-4">
        <div className="space-y-2.5">
          {[
            {
              k: "Platform access",
              v: "Full access to the Texas Jury Study dashboard.",
            },
            {
              k: "Session video",
              v: "Delivered within three business days.",
              badge: "3 days",
            },
            {
              k: "Written transcript",
              v: "Delivered within one week.",
              badge: "1 week",
            },
            {
              k: "Participant demographic summary",
              v: "A profile of the panel that heard your case.",
            },
          ].map((item) => (
            <div
              key={item.k}
              className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3"
            >
              <CheckCircle2 className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
              <div className="flex-1 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{item.k}</p>
                  <p className="text-sm text-slate-600">{item.v}</p>
                </div>
                {item.badge && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Expedited delivery.</span> Faster turnaround
            of video and transcript is available for an additional fee; please contact the team to
            arrange.
          </p>
        </div>
      </div>
    ),
    videoUrl: FOCUS_GROUP_VIDEOS.general.url,
    videoCaption: "Included deliverables",
    videoLabel: FOCUS_GROUP_VIDEOS.general.title,
  },
  {
    id: "in-person",
    title: "In-person focus groups",
    subtitle: "Conducted at our mock courtroom in Conroe, Texas.",
    icon: MapPin,
    body: (
      <div className="space-y-4">
        <p>
          In-person sessions are currently offered at our{" "}
          <span className="font-semibold text-slate-900">mock courtroom in Conroe, Texas</span>.
        </p>
        <p>
          Please contact the team by email or telephone to request an in-person session. We will
          coordinate scheduling, pricing, and logistics with you directly.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="mailto:info@texasjurystudy.com"
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 hover:border-slate-400 transition-colors"
          >
            <div className="h-10 w-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Email
              </p>
              <p className="text-sm font-semibold text-slate-900">Request in-person session</p>
            </div>
          </a>
          <a
            href="tel:"
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 hover:border-slate-400 transition-colors"
          >
            <div className="h-10 w-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Telephone
              </p>
              <p className="text-sm font-semibold text-slate-900">Speak with the team</p>
            </div>
          </a>
        </div>
        <Link
          href="/dashboard/requestee/in-person"
          className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 underline underline-offset-2 text-sm font-medium"
        >
          Further information regarding in-person sessions <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Conroe mock courtroom",
    videoLabel: "Our in-person facility",
  },
];

export default function RequesteeHomePage() {
  return (
    <div className="flex min-h-screen bg-white font-sans">
      <RequesteeSidebar activeTab="home" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
          {/* HERO */}
          <header className="mb-14 pb-10 border-b border-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4">
              Orientation
            </p>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]">
              Ready to Submit Your Case
            </h1>

            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-2xl">
              The following provides a brief orientation to the Texas Jury Study process — the
              considerations that inform a successful submission, the format of our sessions, how
              participants and presenters are selected, and the deliverables you will receive. Please
              review prior to submitting your first case.
            </p>

            {/* Hero summary */}
            <dl className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              {[
                { k: "1 hour", v: "Standard session" },
                { k: "3 business days", v: "Session video" },
                { k: "1 week", v: "Written transcript" },
                { k: "1 observer", v: "Per session" },
              ].map((s) => (
                <div key={s.v} className="border-l border-slate-200 pl-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {s.v}
                  </dt>
                  <dd className="text-xl font-bold text-slate-900 mt-1">{s.k}</dd>
                </div>
              ))}
            </dl>
          </header>

          {/* FEATURED VIDEO */}
          <section className="mb-16">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Overview
              </p>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Introduction to the process</h2>
            </div>
            <VideoCard
              url={FOCUS_GROUP_VIDEOS.general.url}
              caption={FOCUS_GROUP_VIDEOS.general.title}
              label="Texas Jury Study overview"
            />
          </section>

          {/* TABLE OF CONTENTS */}
          <nav className="mb-16 rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Contents
              </h2>
              <span className="text-[11px] text-slate-400">{sections.length} sections</span>
            </div>
            <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {sections.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors group"
                    >
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400 group-hover:text-slate-700 transition-colors w-5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-700 shrink-0 transition-colors" />
                      <span className="text-slate-700 group-hover:text-slate-900 transition-colors">
                        {s.title}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* SECTIONS */}
          <div className="space-y-20">
            {sections.map((s, i) => {
              const Icon = s.icon;
              const isReversed = i % 2 === 1;
              return (
                <section key={s.id} id={s.id} className="scroll-mt-28">
                  {/* Section header */}
                  <div className="flex items-start gap-4 mb-6 pb-5 border-b border-slate-200">
                    <div className="shrink-0 h-11 w-11 rounded-md bg-slate-900 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className="text-[10px] font-semibold tracking-widest text-slate-400 mb-1">
                        Section {String(i + 1).padStart(2, "0")} of{" "}
                        {String(sections.length).padStart(2, "0")}
                      </p>
                      <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 leading-tight">
                        {s.title}
                      </h2>
                      {s.subtitle && (
                        <p className="text-[15px] text-slate-500 mt-1.5">{s.subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* Section body */}
                  <div
                    className={`grid lg:grid-cols-2 gap-8 items-start ${
                      isReversed ? "lg:[&>*:first-child]:order-2" : ""
                    }`}
                  >
                    <div className="text-[15px] text-slate-700 leading-relaxed">{s.body}</div>
                    <div className="lg:sticky lg:top-28">
                      <VideoCard
                        url={s.videoUrl}
                        caption={s.videoCaption}
                        label={s.videoLabel}
                      />
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-24 rounded-lg border border-slate-200 bg-slate-50 p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Next step
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  Submit your case
                </h3>
                <p className="text-sm text-slate-600 mt-2 max-w-md">
                  Your submission will be reviewed by our team, and a session date confirmed within
                  several days.
                </p>
              </div>
              <Link
                href="/dashboard/requestee/new"
                className="shrink-0 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-5 py-3 rounded-md shadow-sm transition-colors"
              >
                Create New Case <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <MapPin className="h-3 w-3" />
            Texas Jury Study &middot; In-person sessions in Conroe, Texas
          </div>
        </div>
      </main>
    </div>
  );
}
