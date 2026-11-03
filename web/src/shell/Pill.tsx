import type { ReactNode } from "react";

export default function Pill({
  tone,
  children,
}: {
  tone?: "green" | "orange" | "red" | "gray";
  children: ReactNode;
}) {
  return (
    <span className={`pill${tone ? ` pill-${tone}` : ""}`}>{children}</span>
  );
}
