import Link from 'next/link';

export default function AccountPage() {
  const tabs = [
    { href: '/crm/account', label: 'Account' },
    { href: '/crm/account/history', label: 'History' },
    { href: '/crm/account/settings', label: 'Settings' },
    { href: '/crm/account/auth', label: 'Login/Logout' },
  ];
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Account</h2>
      <div className="tabs">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className={`tab${t.href === '/account' ? ' active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <p className="muted">Manage your profile, see recent stops, and adjust preferences.</p>
    </div>
  );
}

