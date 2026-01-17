// app/(pwa)/storefront/orders/layout.tsx
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm">
      <main className="crm-main" style={{ padding: 16 }}>{children}</main>
    </div>
  );
}
