import { useState, type ReactNode } from "react";

/** iOS large-title page: the title collapses into a centered nav-bar title on scroll. */
export default function Page({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="page">
      <header className={`page-nav chrome${collapsed ? " collapsed" : ""}`}>
        <h2 aria-hidden={!collapsed}>{title}</h2>
      </header>
      <main
        className="page-scroll"
        onScroll={(e) => setCollapsed(e.currentTarget.scrollTop > 34)}
      >
        <h1 className="page-title chrome">{title}</h1>
        {children}
      </main>
    </div>
  );
}
