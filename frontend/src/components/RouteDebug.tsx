import { useLocation } from "react-router-dom";

export default function RouteDebug() {
  const location = useLocation();

  if (import.meta.env.PROD) return null;

  const route =
    location.pathname +
    location.search +
    location.hash;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        pointerEvents: "none",
        background: "#111827",
        color: "#67E8F9",
        padding: "12px 16px",
        borderRadius: 8,
        fontSize: 13,
        maxWidth: "80vw",
        overflowWrap: "anywhere",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(103, 232, 249, 0.2)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      <div style={{ color: "#9CA3AF", fontSize: 11, marginBottom: 4, letterSpacing: "0.05em", fontWeight: 600 }}>
        CURRENT ROUTE
      </div>
      <div style={{ fontWeight: 500 }}>{route}</div>
    </div>
  );
}
