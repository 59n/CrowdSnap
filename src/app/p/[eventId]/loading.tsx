export default function GuestEventLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-muted mb-6" />
      <div className="h-8 w-56 bg-muted rounded-md mb-3" />
      <div className="h-4 w-72 bg-muted/70 rounded-md mb-8" />
      <div className="w-full max-w-md h-40 rounded-2xl border border-border/40 bg-muted/20" />
    </div>
  );
}
