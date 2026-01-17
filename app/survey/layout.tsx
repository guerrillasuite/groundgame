// app/survey/layout.tsx
export default function SurveyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'rgb(var(--bg-900))'
    }}>
      {children}
    </div>
  );
}