import { supabase } from "@/lib/supabase/client";
import Link from 'next/link';

type Stop = {
  id: string;
  stop_at: string;
  outcome?: string | null;
  notes?: string | null;
  walklist_id?: string | null;
  household_id?: string | null;
};

export default async function HistoryPage() {
  // Assumes RLS filters by current user; otherwise add .eq('user_id', user.id)
  const { data, error } = await supabase
    .from('stops')
    .select('id, stop_at, outcome, notes, walklist_id, household_id')
    .order('stop_at', { ascending: false })
    .limit(50);

  const tabs = [
    { href: '/crm/account', label: 'Account' },
    { href: '/crm/account/history', label: 'History' },
    { href: '/crm/account/settings', label: 'Settings' },
    { href: '/crm/account/auth', label: 'Login/Logout' },
  ];
  
  if (error) {
    return <p className="muted">Error loading history: {error.message}</p>;
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Recent Stops</h2>
      <div className="tabs">
        {tabs.map(t => (
          <Link key={t.href} href={t.href} className={`tab${t.href === '/account/history' ? ' active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <div className="list">
        {(data ?? []).map((s: Stop) => (
          <div key={s.id} className="list-item">
            <h4>{new Date(s.stop_at).toLocaleString()}</h4>
            <p>{s.outcome ?? 'â€”'}{s.notes ? ` â€” ${s.notes}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

