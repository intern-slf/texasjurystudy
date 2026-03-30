"use client";

import { useState } from "react";
import Link from "next/link";
import PresenterSidebar from "@/components/PresenterSidebar";
import { ChevronDown, ChevronUp, AlertCircle, ArrowRight } from "lucide-react";

type FAQ = {
  question: string;
  answer: React.ReactNode;
  tag?: string;
};

const sections: { title: string; faqs: FAQ[] }[] = [
  {
    title: "Getting Started",
    faqs: [
      {
        question: "How do I submit a new case?",
        answer: (
          <ol className="space-y-2 list-none">
            <li><span className="font-medium text-slate-800">1. Click &ldquo;Create New Case&rdquo;</span> in the left sidebar.</li>
            <li><span className="font-medium text-slate-800">2. Fill in Case Details</span> — title, brief description, and deadline date &amp; time.</li>
            <li><span className="font-medium text-slate-800">3. Apply Filters (optional)</span> — narrow the juror pool by demographics.</li>
            <li><span className="font-medium text-slate-800">4. Click &ldquo;Save Case &amp; Filter&rdquo;</span> to submit for admin review.</li>
            <li><span className="font-medium text-slate-800">5. Upload case files</span> on the case detail page that opens after saving.</li>
          </ol>
        ),
      },
      {
        question: "What happens after I submit a case?",
        answer: (
          <p>
            Your case appears under <span className="font-medium text-slate-800">Requested Cases</span> with a{" "}
            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span> status.
            An admin reviews it and either approves or declines it. You will be notified of the decision.
          </p>
        ),
      },
      {
        question: "What is the difference between Requested, Approved, and Previous Cases?",
        answer: (
          <ul className="space-y-2">
            <li><span className="font-medium text-slate-800">Requested Cases</span> — submitted and awaiting admin review.</li>
            <li><span className="font-medium text-slate-800">Approved Cases</span> — confirmed by an admin; scheduled or in progress.</li>
            <li><span className="font-medium text-slate-800">Previous Cases</span> — completed or archived sessions.</li>
          </ul>
        ),
      },
    ],
  },
  {
    title: "Follow-Up Focus Groups",
    faqs: [
      {
        tag: "Important",
        question: "What is a follow-up focus group and when should I use it?",
        answer: (
          <div className="space-y-2">
            <p>
              A <span className="font-medium text-slate-800">follow-up focus group</span> is a second (or subsequent) session
              on the same case — for example, to test revised arguments, explore a new issue, or gather additional juror
              feedback after your first session.
            </p>
            <p>
              Use a follow-up instead of creating an unrelated new case whenever you are continuing work on an
              existing matter.
            </p>
          </div>
        ),
      },
      {
        tag: "Important",
        question: "How do I request a follow-up focus group — step by step?",
        answer: (
          <div className="space-y-3">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-blue-800 text-xs font-medium">
              Always use these steps for a follow-up. Do <strong>not</strong> create a brand-new unrelated case —
              that makes it harder for admins to connect it to your original session.
            </div>
            <ol className="space-y-2 list-none">
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>Go to <span className="font-medium text-slate-800">Previous Cases</span> in the sidebar and find the completed case you want to follow up on.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>Click <span className="font-medium text-slate-800">&ldquo;Create New Case&rdquo;</span> in the sidebar.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>
                  In the <span className="font-medium text-slate-800">Case Title</span>, clearly label it as a follow-up.{" "}
                  <span className="italic text-slate-500">Example: &ldquo;Smith v. Jones — Follow-Up Session 2&rdquo;</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">4</span>
                <span>
                  In the <span className="font-medium text-slate-800">Description</span>, reference the original case.{" "}
                  <span className="italic text-slate-500">Example: &ldquo;Follow-up to [original case title] held on [date]. Purpose: test revised damages argument.&rdquo;</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">5</span>
                <span>Set a new <span className="font-medium text-slate-800">Deadline Date</span> for this session.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">6</span>
                <span>Apply any updated filters if your attendee criteria has changed, then click <span className="font-medium text-slate-800">&ldquo;Save Case &amp; Filter&rdquo;</span>.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">7</span>
                <span>Upload any updated or new case files on the case detail page.</span>
              </li>
            </ol>
          </div>
        ),
      },
      {
        tag: "Important",
        question: "How is a follow-up different from creating a duplicate case?",
        answer: (
          <div className="space-y-2">
            <p>
              A <span className="font-medium text-slate-800">duplicate case</span> is an accidental re-submission of the
              same case without linking it to the original. This creates confusion for admins and may cause your request to be
              declined.
            </p>
            <p>A proper follow-up:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Has a title that clearly says &ldquo;Follow-Up&rdquo; or &ldquo;Session 2&rdquo;.</li>
              <li>References the original case name and date in the description.</li>
              <li>Has a new deadline and may have updated files or filters.</li>
            </ul>
            <p className="mt-1">
              A duplicate case has the <span className="font-medium text-slate-800">same title and description</span> as a
              case already in your Requested, Approved, or Previous Cases list with no distinguishing context.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    title: "Case Management",
    faqs: [
      {
        question: "Can I edit a case after submitting it?",
        answer: (
          <p>
            Once submitted, a case enters admin review and cannot be edited directly. If changes are needed, contact the
            admin or — if the option is available — decline the case and resubmit with corrections.
          </p>
        ),
      },
      {
        question: "How do I upload case files and exhibits?",
        answer: (
          <p>
            After saving a case you are redirected to the case detail page. From there you can upload documents, exhibits,
            or evidence files for jurors to review before the session.
          </p>
        ),
      },
      {
        question: "What filters can I apply to the juror pool?",
        answer: (
          <p>
            You can filter by age range, gender, ethnicity, education level, employment status, and political affiliation.
            Filters are optional — leaving them blank allows any eligible participant to join.
          </p>
        ),
      },
      {
        question: "What should I do if my case is declined?",
        answer: (
          <p>
            Your case will show a{" "}
            <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Declined</span>{" "}
            status. Review any feedback from the admin, correct the issue, and submit a new case with the updated information.
          </p>
        ),
      },
      {
        question: "How are participants matched to my case?",
        answer: (
          <p>
            Participants are matched based on the filters set during case creation. The system selects eligible participants
            from the pool up to your specified Number of Attendees.
          </p>
        ),
      },
      {
        question: "Who do I contact for technical issues?",
        answer: (
          <p>
            For technical issues not covered here, reach out to the Texas Jury Study administrator through the contact
            information provided in your onboarding materials.
          </p>
        ),
      },
    ],
  },
];

export default function FAQsPage() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setOpenKey(openKey === key ? null : key);
  };

  return (
    <div className="flex min-h-screen bg-muted/10 font-sans">
      <PresenterSidebar activeTab="faqs" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-12">
          <header className="mb-8">
            <h1 className="text-4xl font-extrabold tracking-tight">
              Frequently Asked Questions
            </h1>
            <p className="mt-2 text-slate-500 text-sm">
              Answers to common questions about submitting cases and requesting follow-up focus groups.
            </p>
          </header>

          {/* Follow-up callout banner */}
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Requesting a follow-up focus group?</p>
              <p>
                Do <strong>not</strong> create a separate unrelated case. Instead, use{" "}
                <span className="font-medium">&ldquo;Create New Case&rdquo;</span> and clearly label the title and
                description as a follow-up to your original session.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setOpenKey("Follow-Up Focus Groups-1");
                    document
                      .getElementById("section-Follow-Up Focus Groups")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1 underline underline-offset-2 font-medium hover:text-amber-900 transition-colors"
                >
                  See step-by-step guide <ArrowRight className="h-3 w-3" />
                </button>
              </p>
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title} id={`section-${section.title}`} className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.faqs.map((faq, idx) => {
                  const key = `${section.title}-${idx}`;
                  const isOpen = openKey === key;
                  return (
                    <div
                      key={key}
                      className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {faq.tag && (
                            <span className="shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                              {faq.tag}
                            </span>
                          )}
                          <span className="truncate">{faq.question}</span>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 ml-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-4" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-4 text-center text-xs text-slate-400">
            Still have questions?{" "}
            <Link
              href="/dashboard/presenter/new"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
            >
              Create a new case
            </Link>{" "}
            or contact your administrator.
          </div>
        </div>
      </main>
    </div>
  );
}
