"use client";

type Props = {
  tab: "current" | "approved" | "previous";
  caseId: string;
  isExpired: boolean;

  softDeleteCase?: (formData: FormData) => void;
  restoreCase?: (formData: FormData) => void;
  permanentDeleteCase?: (formData: FormData) => void;
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
    <div className="mt-4 flex gap-4 items-center">
      {/* CURRENT → Archive */}
      {tab === "current" && softDeleteCase && (
        <form action={softDeleteCase}>
          <input type="hidden" name="case_id" value={caseId} />
          <button className="text-sm underline">Archive</button>
        </form>
      )}

      {/* APPROVED → Locked */}
      {tab === "approved" && (
        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
          Approved by Admin
        </span>
      )}

      {/* PREVIOUS → Restore */}
      {tab === "previous" && restoreCase && !isExpired && (
        <form action={restoreCase}>
          <input type="hidden" name="case_id" value={caseId} />
          <button className="text-sm underline">Restore</button>
        </form>
      )}

      {/* PREVIOUS → Permanent Delete */}
      {tab === "previous" && permanentDeleteCase && (
        <form
          action={permanentDeleteCase}
          onSubmit={(e) => {
            if (!confirm("This will permanently delete the case. Continue?")) {
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
