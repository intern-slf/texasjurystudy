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
  Sparkles,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { FOCUS_GROUP_VIDEOS } from "@/lib/focus-group-videos";

function VideoPlayer({ url, label }: { url: string; label?: string }) {
  if (!url) {
    return (
      <div className="aspect-video w-full bg-gradient-to-br from-slate-800 via-slate-900 to-black rounded-xl flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.1),transparent_50%)]" />
        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:bg-white/10 transition-colors">
            <Play className="w-6 h-6 text-white/70 ml-0.5" />
          </div>
          <span className="text-xs uppercase tracking-widest text-white/40 font-semibold mb-1">
            Video coming soon
          </span>
          {label && (
            <span className="text-sm text-white/60 font-medium mt-1 max-w-xs">
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
      <div className="aspect-video bg-slate-900 rounded-xl w-full overflow-hidden">
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
      className="aspect-video bg-slate-900 rounded-xl w-full object-cover"
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
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <p className="text-[11px] font-semibold tracking-wider uppercase text-white/90">
          {caption || "Watch a short video"}
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
  accent: string;
  body: React.ReactNode;
  videoUrl: string;
  videoCaption: string;
  videoLabel: string;
};

const sections: Section[] = [
  {
    id: "purpose",
    title: "Things to consider",
    subtitle: "What do you want to learn from your focus group?",
    icon: Lightbulb,
    accent: "from-amber-400 to-orange-500",
    body: (
      <div className="space-y-4">
        <p>
          Every case is different, and so is every focus group. Before you submit, think about what you
          most need feedback on. Common goals:
        </p>
        <ul className="space-y-2.5">
          {[
            { k: "Liability", v: "Is the story persuasive?" },
            { k: "Damages", v: "What do real Texans value the harm at?" },
            { k: "Opening statement", v: "Reactions to your delivery and framing." },
            { k: "Deposition clips", v: "Credibility and impact of witness testimony." },
            { k: "Demonstrative aids", v: "Do your visuals actually land?" },
          ].map((item) => (
            <li key={item.k} className="flex gap-3">
              <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold text-slate-900">{item.k}</span>
                <span className="text-slate-600"> — {item.v}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-slate-600 italic">
          Tell us what you want to focus on — we tailor the session to your goals.
        </p>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Tailoring your focus group",
    videoLabel: "Choosing what to test in your session",
  },
  {
    id: "most-common",
    title: "Most common type",
    subtitle: "Narrative focus group",
    icon: BookOpen,
    accent: "from-blue-400 to-indigo-500",
    body: (
      <div className="space-y-4">
        <p>
          A neutral statement of the facts is presented, then we walk the audience through the key issues
          in your case.
        </p>
        <p>
          Participants share their reactions as the story unfolds — what feels strong, what confuses
          them, what they would award. It is the format most attorneys start with.
        </p>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5 w-fit">
          <Sparkles className="h-3.5 w-3.5" />
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
    title: "How much time should I request?",
    subtitle: "Average is 1 hour. Adjust based on where you are in the case.",
    icon: Clock,
    accent: "from-emerald-400 to-teal-500",
    body: (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-extrabold text-slate-900">1 hr</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                Default
              </span>
            </div>
            <p className="text-sm text-slate-600">
              The standard session length. Right for most attorneys testing a focused question.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-extrabold text-slate-900">3 hr</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                Close to trial
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Cover the full case in one sitting when you are weeks away from trial.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-blue-900">Early in your case?</span> We recommend
            splitting into two 1-hour sessions — one on liability, one on damages. You get cleaner
            feedback on each.
          </p>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Picking the right length",
    videoLabel: "1 hour vs 3 hour vs split sessions",
  },
  {
    id: "participants",
    title: "How are participants selected?",
    subtitle: "A random cross-section of Texas, with options to fine-tune.",
    icon: Users,
    accent: "from-purple-400 to-pink-500",
    body: (
      <div className="space-y-4">
        <p>
          Every panel is a <span className="font-semibold text-slate-900">random cross-section of Texans</span> —
          the same kind of mix you would expect to see in a jury box.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="shrink-0 h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">County demographic match</p>
              <p className="text-sm text-slate-600">
                Request participants whose demographics mirror your case&rsquo;s venue county. A small
                upcharge applies and is disclosed at submission.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 h-8 w-8 rounded-lg bg-pink-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-pink-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Political-lean panel</p>
              <p className="text-sm text-slate-600">
                Request a <span className="font-medium">conservative</span> or{" "}
                <span className="font-medium">liberal</span> leaning panel when your case calls for it.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "How we select participants",
    videoLabel: "Random sampling and demographic options",
  },
  {
    id: "presenter",
    title: "Who presents my case?",
    subtitle: "TJS-trained presenter by default. Self-presentation available.",
    icon: Mic,
    accent: "from-rose-400 to-red-500",
    body: (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-rose-50 to-red-50 px-4 py-2.5 border-b border-rose-100">
            <p className="text-xs font-bold uppercase tracking-wider text-rose-700">Default option</p>
          </div>
          <div className="p-4">
            <p className="font-semibold text-slate-900 mb-1">TJS presenter</p>
            <p className="text-sm text-slate-600">
              A trained, experienced Texas Jury Study presenter delivers your case for you. This is what
              we recommend and what most attorneys choose.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Alternative</p>
          </div>
          <div className="p-4">
            <p className="font-semibold text-slate-900 mb-1">Self-presentation</p>
            <p className="text-sm text-slate-600">
              Allowed if you prefer to present yourself. Not recommended unless you have significant
              experience presenting to lay audiences. Email TJS separately to arrange.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <span className="font-semibold text-emerald-900">Same price either way.</span> Choose what
            fits your case best.
          </span>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Who presents your case",
    videoLabel: "TJS presenter vs self-presentation",
  },
  {
    id: "timing",
    title: "When will it be conducted?",
    subtitle: "Sessions run on a schedule. Usually within a few days.",
    icon: CalendarDays,
    accent: "from-sky-400 to-cyan-500",
    body: (
      <div className="space-y-4">
        <p>
          Sessions run on a regular schedule. Most cases are conducted with just a few days&rsquo;
          notice, depending on demand.
        </p>
        <p>
          You will pick a target timeframe on the submission form, and we will confirm a date with you
          once your case is reviewed.
        </p>
        <div className="flex items-center gap-3 rounded-xl bg-sky-50 border border-sky-100 p-4">
          <div className="h-10 w-10 rounded-full bg-white border border-sky-200 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-900">Typical lead time</p>
            <p className="text-sm text-sky-700">A few days from approval to session.</p>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Scheduling and turnaround",
    videoLabel: "From submission to session day",
  },
  {
    id: "observers",
    title: "Observers",
    subtitle: "Optional. Most attorneys do not attend live.",
    icon: Eye,
    accent: "from-violet-400 to-purple-500",
    body: (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-violet-600" />
              <p className="font-semibold text-slate-900 text-sm">1 observer per session</p>
            </div>
            <p className="text-sm text-slate-600">
              You may have one observer join live to watch silently.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-4 w-4 text-violet-600" />
              <p className="font-semibold text-slate-900 text-sm">Video provided</p>
            </div>
            <p className="text-sm text-slate-600">
              Most customers skip the live attendance and review the full recording later.
            </p>
          </div>
        </div>
      </div>
    ),
    videoUrl: "",
    videoCaption: "Observers and live attendance",
    videoLabel: "Watching live vs reviewing later",
  },
  {
    id: "fee",
    title: "What's included in the fee?",
    subtitle: "Everything you need to act on the results.",
    icon: Receipt,
    accent: "from-green-400 to-emerald-500",
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
              v: "Delivered within 3 business days.",
              badge: "3 days",
            },
            {
              k: "Written transcript",
              v: "Delivered within 1 week.",
              badge: "1 week",
            },
            {
              k: "Demographic intro",
              v: "Know exactly who you heard from.",
            },
          ].map((item) => (
            <div
              key={item.k}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{item.k}</p>
                  <p className="text-sm text-slate-600">{item.v}</p>
                </div>
                {item.badge && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-amber-900">Need it faster?</span> Expedited video and
            transcript delivery is available for an additional fee — contact the team to arrange.
          </p>
        </div>
      </div>
    ),
    videoUrl: FOCUS_GROUP_VIDEOS.general.url,
    videoCaption: "What's included",
    videoLabel: FOCUS_GROUP_VIDEOS.general.title,
  },
  {
    id: "in-person",
    title: "In-person focus groups",
    subtitle: "Held at our mock courtroom in Conroe, TX.",
    icon: MapPin,
    accent: "from-orange-400 to-rose-500",
    body: (
      <div className="space-y-4">
        <p>
          In-person sessions are currently offered at our{" "}
          <span className="font-semibold text-slate-900">mock courtroom in Conroe, TX</span>.
        </p>
        <p>
          Email or call us to request an in-person session. We will walk you through scheduling, pricing,
          and logistics.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="mailto:info@texasjurystudy.com"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</p>
              <p className="text-sm font-semibold text-slate-900">Request in-person</p>
            </div>
          </a>
          <a
            href="tel:"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Call</p>
              <p className="text-sm font-semibold text-slate-900">Speak with the team</p>
            </div>
          </a>
        </div>
        <Link
          href="/dashboard/requestee/in-person"
          className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-800 underline underline-offset-2 text-sm font-medium"
        >
          Learn more about in-person sessions <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    ),
    videoUrl: "",
    videoCaption: "In-person at the Conroe mock courtroom",
    videoLabel: "A look at our in-person facility",
  },
];

export default function RequesteeHomePage() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 font-sans">
      <RequesteeSidebar activeTab="home" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
          {/* HERO */}
          <header className="mb-14">
            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1">
                <Sparkles className="h-3 w-3" />
                Welcome
              </span>
              <span className="text-[11px] font-medium text-slate-400">3 min read</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.05]">
              Ready to Submit
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Your Case
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-2xl">
              A quick orientation to how Texas Jury Study focus groups work — what to consider, how
              time and participants are handled, who presents, and what you will receive. Read through
              this once before you create your first case.
            </p>

            {/* Hero stats */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { k: "1 hr", v: "Avg. session" },
                { k: "3 days", v: "Video delivery" },
                { k: "1 week", v: "Transcript" },
                { k: "1", v: "Observer per session" },
              ].map((s) => (
                <div
                  key={s.v}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-2xl font-extrabold text-slate-900 leading-none">{s.k}</p>
                  <p className="text-xs text-slate-500 mt-1.5">{s.v}</p>
                </div>
              ))}
            </div>
          </header>

          {/* FEATURED VIDEO */}
          <section className="mb-16">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Featured
                </p>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Start here — overview</h2>
              </div>
            </div>
            <VideoCard
              url={FOCUS_GROUP_VIDEOS.general.url}
              caption={FOCUS_GROUP_VIDEOS.general.title}
              label="Texas Jury Study overview"
            />
          </section>

          {/* TABLE OF CONTENTS */}
          <nav className="mb-16 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                On this page
              </h2>
              <span className="text-[11px] text-slate-400">{sections.length} sections</span>
            </div>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {sections.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors group"
                    >
                      <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 group-hover:bg-blue-100 text-slate-500 group-hover:text-blue-700 text-[10px] font-bold flex items-center justify-center transition-colors">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                      <span className="text-slate-700 group-hover:text-blue-700 transition-colors">
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
                <section
                  key={s.id}
                  id={s.id}
                  className="scroll-mt-28"
                >
                  {/* Section header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div
                      className={`shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br ${s.accent} flex items-center justify-center shadow-md shadow-slate-200`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold tracking-widest text-slate-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-[10px] font-bold tracking-widest text-slate-300">/</span>
                        <span className="text-[10px] font-bold tracking-widest text-slate-400">
                          {String(sections.length).padStart(2, "0")}
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                        {s.title}
                      </h2>
                      {s.subtitle && (
                        <p className="text-base text-slate-500 mt-1">{s.subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* Section body: alternating two-column */}
                  <div
                    className={`grid lg:grid-cols-2 gap-8 items-start ${
                      isReversed ? "lg:[&>*:first-child]:order-2" : ""
                    }`}
                  >
                    <div className="text-[15px] text-slate-700 leading-relaxed">{s.body}</div>
                    <div className="lg:sticky lg:top-8">
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
          <div className="mt-24 relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-10 sm:p-12 shadow-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.25),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(168,85,247,0.2),transparent_50%)]" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-300 mb-2">
                  You&rsquo;re ready
                </p>
                <h3 className="text-3xl font-extrabold tracking-tight text-white">
                  Submit your first case
                </h3>
                <p className="text-base text-blue-100/80 mt-2 max-w-md">
                  We will review it and confirm a session date — typically within a few days.
                </p>
              </div>
              <Link
                href="/dashboard/requestee/new"
                className="shrink-0 inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-blue-900/30 transition-all hover:scale-[1.02]"
              >
                Create New Case <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <MapPin className="h-3 w-3" />
            Texas Jury Study &middot; In-person sessions in Conroe, TX
          </div>
        </div>
      </main>
    </div>
  );
}
