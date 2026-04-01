"use client";

import { useEffect, useState } from "react";
import { SurveyContainer } from "./SurveyContainer";

interface Props {
  surveyId: string;
  footerText?: string;
}

export default function AnonymousSurveyEntry({ surveyId, footerText }: Props) {
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    const key = `anon_survey_${surveyId}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    setContactId(id);
  }, [surveyId]);

  if (!contactId) return null;

  return (
    <>
      <SurveyContainer surveyId={surveyId} contactId={contactId} randomizeOptions={true} />
      {footerText && (
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px",
            color: "rgb(var(--text-300))",
            fontSize: "12px",
            background: "rgb(var(--bg-900))",
          }}
        >
          {footerText}
        </div>
      )}
    </>
  );
}
