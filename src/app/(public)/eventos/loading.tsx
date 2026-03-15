import { Skeleton } from "@/components/ui/skeleton";

export default function EventosLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      {/* Events grid */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl border border-linea overflow-hidden"
            >
              <Skeleton className="aspect-[16/9]" />
              <div className="p-5 space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
