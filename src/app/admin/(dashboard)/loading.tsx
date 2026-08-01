export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-md" />
      <div className="h-4 w-72 bg-muted/70 rounded-md" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-border/40 bg-muted/30" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-xl border border-border/40 bg-muted/20" />
        ))}
      </div>
    </div>
  );
}
