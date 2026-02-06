export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 p-6 animate-pulse">
      <div className="h-40 bg-slate-200 rounded-xl" />
      <div className="h-60 bg-slate-100 rounded-xl" />
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="h-64 bg-slate-50 rounded-lg" />
      </div>
    </div>
  );
}