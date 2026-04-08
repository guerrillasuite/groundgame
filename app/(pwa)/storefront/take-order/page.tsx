"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SurveyPanel = dynamic(() => import("@/app/components/survey/SurveyPanel"), { ssr: false });

type Survey = {
  id: string;
  title: string;
  storefront_mode: string | null;
  delivery_enabled: boolean;
  payment_enabled: boolean;
  order_products: string[] | null;
};

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  order_index: number;
  options: string[] | null;
  display_format: string | null;
  required: boolean;
  conditions?: any;
};

export default function TakeOrderPage() {
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined); // undefined = loading
  const [questions, setQuestions] = useState<Question[]>([]);
  const [viewConfig, setViewConfig] = useState<any>(null);

  useEffect(() => {
    fetch("/api/survey/intake?channel=storefront")
      .then((r) => r.json())
      .then((data) => {
        setSurvey(data.survey ?? null);
        setQuestions(data.questions ?? []);
        setViewConfig(data.viewConfig ?? null);
      })
      .catch(() => setSurvey(null));
  }, []);

  if (survey === undefined) {
    return (
      <section style={{ padding: 32, textAlign: "center", opacity: 0.5 }}>
        Loading…
      </section>
    );
  }

  if (!survey) {
    return (
      <section className="stack" style={{ padding: 32 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Take Order</h1>
        <p style={{ opacity: 0.6, marginTop: 8 }}>
          No storefront survey configured. Go to{" "}
          <a href="/crm/survey" style={{ color: "var(--gg-primary, #2563eb)" }}>
            Survey Builder
          </a>{" "}
          and enable the <strong>Storefront</strong> channel on a survey.
        </p>
      </section>
    );
  }

  return (
    <SurveyPanel
      surveyId={survey.id}
      tenantId=""
      title={survey.title}
      websiteUrl={null}
      footerText={null}
      questions={questions}
      isKiosk={false}
      viewConfig={viewConfig}
      deliveryEnabled={survey.delivery_enabled}
      orderProducts={survey.order_products}
    />
  );
}
