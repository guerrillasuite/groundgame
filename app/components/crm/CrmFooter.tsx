import Link from "next/link";

export default function CrmFooter() {
  return (
    <footer className="crm-footer">
      <div className="crm-footer-inner">
        <small className="muted">© {new Date().getFullYear()} GuerrillaSuite · GroundGame</small>
        <nav className="crm-footer-nav">
          <Link href="/crm" className="muted">Home</Link>
          <Link href="/crm/opportunities" className="muted">Opportunities</Link>
          <Link href="/crm/people" className="muted">People</Link>
          <Link href="/crm/account" className="muted">Account</Link>
        </nav>
      </div>
    </footer>
  );
}
