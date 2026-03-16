import { SurveyContainer } from "@/app/components/survey/SurveyContainer";
import PublicSurveyEntry from "@/app/components/survey/PublicSurveyEntry";
import { createClient } from "@supabase/supabase-js";

async function fetchContactInfo(contactId: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await sb
    .from("people")
    .select("first_name, last_name, email, phone")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return undefined;
  return {
    name: [data.first_name, data.last_name].filter(Boolean).join(" "),
    email: data.email ?? "",
    phone: data.phone ?? "",
  };
}

interface Props {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ cid?: string }>;
}

export default async function PublicSurveyPage({ params, searchParams }: Props) {
  const { surveyId } = await params;
  const { cid } = await searchParams;
  const contactInfo = cid ? await fetchContactInfo(cid) : undefined;

  return (
    <>
      {cid ? (
        // Pre-personalized link: go straight to survey
        <SurveyContainer surveyId={surveyId} contactId={cid} contactInfo={contactInfo} randomizeOptions={true} />
      ) : (
        // No contact ID: lookup flow
        <PublicSurveyEntry surveyId={surveyId} />
      )}

      <div
        style={{
          textAlign: "center",
          padding: "24px 16px",
          color: "rgb(var(--text-300))",
          fontSize: "12px",
          background: "rgb(var(--bg-900))",
        }}
      >
        Paid for by the Libertarian Booster PAC
      </div>
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ surveyId: string }> }) {
  return {
    title: "Survey | GroundGame",
    description: "Complete your survey",
  };
}
