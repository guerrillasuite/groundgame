import BottomNav from "@/components/BottomNav";

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "rgb(10 13 20)" }}>
      <div style={{ paddingBottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))" }}>
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
