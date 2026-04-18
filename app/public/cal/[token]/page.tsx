// app/public/cal/[token]/page.tsx
export const dynamic = "force-dynamic";

import PublicCalendarEmbed from "./PublicCalendarEmbed";

export default async function PublicCalendarPage({ params }: { params: { token: string } }) {
  return <PublicCalendarEmbed token={params.token} />;
}
