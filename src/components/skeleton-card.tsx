type SkeletonCardProps = {
  count?: number;
  compact?: boolean;
};

export function SkeletonCard({ count = 4, compact = false }: SkeletonCardProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Đang tải dữ liệu">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`glass overflow-hidden rounded-[22px] p-4 ${compact ? "" : "min-h-[142px]"}`}
        >
          <div className="shimmer h-5 w-3/5 rounded-full" />
          <div className="shimmer mt-3 h-3 w-5/6 rounded-full" />
          <div className="shimmer mt-2 h-3 w-2/5 rounded-full" />
          <div className="mt-5 flex gap-2">
            <div className="shimmer h-7 w-20 rounded-full" />
            <div className="shimmer h-7 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
