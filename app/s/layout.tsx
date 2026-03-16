export default function PublicSurveyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "rgb(var(--bg-900))" }}>
      {children}
    </div>
  );
}
