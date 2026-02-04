"use client";

import { TutorialStep } from "./tutorial-step";
import { CodeBlock } from "./code-block";
import { Database, ShieldAlert, Code2, Rocket } from "lucide-react";

// Updated SQL to reflect FocusGroup Domain (Research Data)
const create = `
-- Create a table for research observations
create table observations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  participant_id uuid references auth.users(id),
  content text not null,
  sentiment_score float
);

-- Insert dummy data for testing
insert into observations (content, sentiment_score)
values 
  ('Participant demonstrated high engagement during the opening argument.', 0.85),
  ('Noticeable skepticism during the expert testimony phase.', -0.42),
  ('Strong alignment with the defense strategy regarding liability.', 0.92);
`.trim();

const rls = `
-- Enable Row Level Security
alter table observations enable row level security;

-- Create a policy to allow presenters to view all data
create policy "Presenters can view all research data"
on observations for select
to authenticated
using ( (select auth.jwt() ->> 'role') = 'presenter' );
`.trim();

const server = `
import { createClient } from '@/lib/supabase/server'

export default async function ResearchDataPage() {
  const supabase = await createClient()
  
  // High-fidelity Server Fetch
  const { data: observations } = await supabase
    .from('observations')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 space-y-4">
      <h1 className="heading-display text-2xl">Live Feed</h1>
      {observations?.map((obs) => (
        <div key={obs.id} className="glass-card p-4 border border-muted/50 rounded-xl">
          <p className="text-sm font-light leading-relaxed">{obs.content}</p>
        </div>
      ))}
    </div>
  )
}
`.trim();

export function FetchDataSteps() {
  return (
    <ol className="flex flex-col gap-12">
      <TutorialStep title="Provision Research Tables">
        <div className="space-y-4">
          <p className="text-muted-foreground font-light leading-relaxed">
            Initialize your research schema within the{" "}
            <a
              href="https://supabase.com/dashboard/project/_/sql/new"
              className="heading-elegant text-accent font-semibold hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              SQL Editor
            </a>. 
            This script establishes a UUID-based observations table with sentiment metadata.
          </p>
          <CodeBlock code={create} label="Schema Definition" />
        </div>
      </TutorialStep>

      <TutorialStep title="Apply Security Protocols (RLS)">
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg border border-accent/20">
            <ShieldAlert className="h-4 w-4 text-accent" />
            <p className="text-[10px] heading-elegant text-accent tracking-widest uppercase">
              Mandatory Protection
            </p>
          </div>
          <p className="text-muted-foreground font-light">
            Secure the data pipeline by restricting visibility to authenticated Presenters. 
            You can manage these policies in the{" "}
            <a
              href="https://supabase.com/dashboard/project/_/auth/policies"
              className="text-accent hover:underline font-medium"
              target="_blank"
              rel="noreferrer"
            >
              Auth Dashboard
            </a>.
          </p>
          <CodeBlock code={rls} label="Security Policy" />
        </div>
      </TutorialStep>

      <TutorialStep title="Implement Server-Side Hydration">
        <div className="space-y-4">
          <p className="text-muted-foreground font-light">
            Fetch high-integrity research data using Next.js **Server Components**. 
            Create your view at <code className="text-accent text-[11px] font-mono">/app/research/page.tsx</code>.
          </p>
          <CodeBlock code={server} label="Server Implementation" />
        </div>
      </TutorialStep>

      <TutorialStep title="Ready for Deployment">
        <div className="p-6 border border-accent/30 bg-accent/5 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="heading-display text-lg">System Synchronized</h4>
            <p className="text-xs text-muted-foreground">Your research infrastructure is now active and secure.</p>
          </div>
          <Rocket className="h-8 w-8 text-accent opacity-50" />
        </div>
      </TutorialStep>
    </ol>
  );
}