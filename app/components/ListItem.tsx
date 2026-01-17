export function ListItem({
  title, subtitle, right
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="list-item">
      <h4>{title}</h4>
      {subtitle && <p>{subtitle}</p>}
      {right && <div style={{ float: 'right', marginTop: -24 }}>{right}</div>}
    </div>
  );
}

