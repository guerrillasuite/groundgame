// components/SortArrow.tsx
export default function SortArrow({
  dir,            // 'asc' | 'desc' | 'none'
  className = "",
}: { dir: 'asc' | 'desc' | 'none'; className?: string }) {
  if (dir === 'none') return null;
  const rotate = dir === 'asc' ? 0 : 180;
  return (
    <svg
      aria-hidden="true"
      width="10" height="10" viewBox="0 0 24 24"
      className={className}
      style={{ marginLeft: 6, transform: `rotate(${rotate}deg)` }}
    >
      <path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
