import Link from "next/link";

type Props = {
  activeTab?: "current" | "previous";
};

export default function PresenterSidebar({ activeTab }: Props) {
  return (
    <aside className="w-64 border-r px-4 py-6 space-y-4">
      <h2 className="text-lg font-semibold">Presenter</h2>

      <nav className="space-y-2">
        <Link
          href="/dashboard/presenter?tab=current"
          className={`block ${
            activeTab === "current"
              ? "font-medium underline"
              : ""
          }`}
        >
          Current
        </Link>

        <Link
          href="/dashboard/presenter/new"
          className="block"
        >
          New
        </Link>

        <Link
          href="/dashboard/presenter?tab=previous"
          className={`block ${
            activeTab === "previous"
              ? "font-medium underline"
              : ""
          }`}
        >
          Previous
        </Link>
      </nav>
    </aside>
  );
}
