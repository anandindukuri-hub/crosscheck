// a small activity spinner for a button that is waiting on the server; it inherits the text color
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={`shrink-0 ${className}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={stroke} />
      <circle className="ring-spin" cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len * 0.28} ${len}`} />
    </svg>
  );
}
