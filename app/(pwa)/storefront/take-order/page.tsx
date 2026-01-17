"use client";

import { useEffect, useRef, useState } from "react";

type HeightMsg = { type: "embed:height"; height?: number };
type ValidatedMsg = { type: "order:validated"; payload?: any };
type AnyMsg = HeightMsg | ValidatedMsg | Record<string, any>;

export default function TakeOrderPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [formReady, setFormReady] = useState(false);
  const [validatedPayload, setValidatedPayload] = useState<any>(null);

  useEffect(() => {
    function onMsg(e: MessageEvent<AnyMsg>) {
      // Only accept messages from OUR iframe, ignore HMR/devtool chatter.
      const fromIframe =
        !!iframeRef.current?.contentWindow && e.source === iframeRef.current.contentWindow;
      if (!fromIframe) return;

      // (Optional) If you ever embed from a different origin, uncomment to restrict:
      // const allowedOrigin = window.location.origin;
      // if (e.origin !== allowedOrigin) return;

      const data = e.data || {};
      if (data.type === "embed:height" && iframeRef.current) {
        const h = Math.max(400, Number((data as HeightMsg).height || 580));
        iframeRef.current.style.height = `${h}px`;
        // console.debug("[parent] resized iframe to", h);
        return;
      }

      if (data.type === "order:validated") {
        const payload = (data as ValidatedMsg).payload ?? null;
        setValidatedPayload(payload);
        setFormReady(true);
        // Helpful console for debugging:
        console.log("[parent] received order:validated", payload);
        return;
      }
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <section style={{ padding: 16 }} className="stack">
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Take Order</h1>
      <p className="text-dim" style={{ marginTop: 6 }}>
        Fill the order form below. After validation, payment will appear here.
      </p>

      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
        <iframe
          ref={iframeRef}
          title="Order Form"
          src="/storefront/take-order/simple-order-form"
          style={{ width: "100%", height: 580, border: 0, background: "transparent" }}
        />
      </div>

      {/* PAYMENT SECTION (appears after we receive order:validated) */}
      <div
        aria-hidden={!formReady}
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px dashed var(--border)",
          opacity: formReady ? 1 : 0.5,
        }}
      >
        <h3 style={{ margin: 0 }}>Payment</h3>
        {!formReady ? (
          <p className="text-dim" style={{ marginTop: 6 }}>
            Waiting for order validation…
          </p>
        ) : (
          <>
            <p className="text-dim" style={{ marginTop: 6 }}>
              Payment element placeholder (Stripe/Square). Use <code>validatedPayload</code> to
              create a PaymentIntent or equivalent.
            </p>

            {/* Simple summary so store staff can confirm */}
            {validatedPayload && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Order Summary</div>
                <div style={{ fontSize: 14 }}>
                  <div>
                    <strong>Customer:</strong>{" "}
                    {validatedPayload?.contact?.first_name} {validatedPayload?.contact?.last_name}
                  </div>
                  <div>
                    <strong>Items:</strong>{" "}
                    {Array.isArray(validatedPayload?.items)
                      ? validatedPayload.items.length
                      : 0}
                  </div>
                  {/* You can render a line-by-line item list if you want: */}
                  {Array.isArray(validatedPayload?.items) && validatedPayload.items.length > 0 && (
                    <ul style={{ marginTop: 6 }}>
                      {validatedPayload.items.map((it: any, i: number) => (
                        <li key={i}>
                          {it.quantity} × {it.sku || it.product_id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <button className="btn" style={{ marginTop: 10 }} disabled>
              Submit Order + Pay (wire payment next)
            </button>
          </>
        )}
      </div>
    </section>
  );
}
