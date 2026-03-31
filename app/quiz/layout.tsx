export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      {children}
    </div>
  );
}
