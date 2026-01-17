import Link from 'next/link';

export function PressCard(props: {
  href: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={props.href} className="press-card" role="button">
      <div className="press-card__icon" aria-hidden="true">
        {props.icon ?? <span>â˜…</span>}
      </div>
      <div>
        <div className="press-card__title">{props.title}</div>
        {props.subtitle && <div className="press-card__subtitle">{props.subtitle}</div>}
      </div>
      <div className="chevron" aria-hidden="true">â€º</div>
    </Link>
  );
}

