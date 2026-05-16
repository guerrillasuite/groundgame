const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function resolveUserEmail(
  userId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    const r = await fetch(`${SB_URL()}/auth/v1/admin/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${SERVICE_KEY()}`,
        apikey: SERVICE_KEY(),
      },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return {
      email: u.email ?? "",
      name:
        u.user_metadata?.name ??
        u.user_metadata?.full_name ??
        u.email ??
        userId,
    };
  } catch {
    return null;
  }
}
