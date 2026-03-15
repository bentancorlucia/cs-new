import { Skeleton } from "@/components/ui/skeleton";

export default function PublicLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Hero skeleton */}
      <div className="relative h-[60vh] min-h-[400px] bg-superficie">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-0 flex items-end">
          <div className="w-full px-6 pb-16 max-w-7xl mx-auto">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-12 w-3/4 max-w-xl mb-4" />
            <Skeleton className="h-6 w-1/2 max-w-md mb-6" />
            <Skeleton className="h-12 w-40 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-6 py-16 space-y-16">
        <div className="space-y-4">
          <Skeleton className="h-3 w-20 mx-auto" />
          <Skeleton className="h-10 w-72 mx-auto" />
          <Skeleton className="h-5 w-96 mx-auto max-w-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="aspect-[4/3] rounded-2xl" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
