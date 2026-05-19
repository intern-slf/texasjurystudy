import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomeAuthSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <section className="pb-24 flex gap-4">
      {!user ? (
        <>
          <Link
            href="/auth/signup?role=participant"
            className="px-6 py-3 rounded-md bg-primary text-primary-foreground"
          >
            Apply to Be a Participant
          </Link>
          <Link
            href="/auth/signup?role=requestee"
            className="px-6 py-3 rounded-md border"
          >
            Request a Focus Group
          </Link>
        </>
      ) : (
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-md bg-primary text-primary-foreground"
        >
          Continue
        </Link>
      )}
    </section>
  );
}
