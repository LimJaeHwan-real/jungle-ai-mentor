export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

