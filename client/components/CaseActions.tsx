"use client";

type Props = {
  tab: "current" | "previous";
  caseId: string;
  isExpired: boolean;
  softDeleteCase: (formData: FormData) => void;
  restoreCase: (formData: FormData) => void;
  permanentDeleteCase: (formData: FormData) => void;
};

export default function CaseActions({
  tab,
  caseId,
  isExpired,
  softDeleteCase,
  restoreCase,
  permanentDeleteCase,
}: Props) {
  return (
    <div className="mt-4 flex gap-4">
      {/* CURRENT → Archive */}
      {tab === "current" && (
        <form
          action={softDeleteCase}
          onSubmit={(e) => {
            if (!confirm("Move this case to Previous?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="case_id" value={caseId} />
          <button className="text-sm underline">
            Archive
          </button>
        </form>
      )}

      {/* PREVIOUS → Restore (ONLY if not expired) */}
      {tab === "previous" && !isExpired && (
        <form action={restoreCase}>
          <input type="hidden" name="case_id" value={caseId} />
          <button className="text-sm underline">
            Restore
          </button>
        </form>
      )}

      {/* PREVIOUS → Permanent delete */}
      {tab === "previous" && (
        <form
          action={permanentDeleteCase}
          onSubmit={(e) => {
            if (
              !confirm(
                "This will permanently delete the case. Continue?"
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="case_id" value={caseId} />
          <button className="text-sm text-destructive underline">
            Delete Permanently
          </button>
        </form>
      )}
    </div>
  );
}
