import type { ReactNode } from "react";

export type TabId = "scan" | "cabinet" | "profiles" | "history";

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 26 26"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: "scan",
    label: "Scan",
    icon: svg(
      <>
        <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M17 4h2.5A2.5 2.5 0 0 1 22 6.5V9M22 17v2.5a2.5 2.5 0 0 1-2.5 2.5H17M9 22H6.5A2.5 2.5 0 0 1 4 19.5V17" />
        <circle cx="13" cy="13" r="3.5" />
      </>,
    ),
  },
  {
    id: "cabinet",
    label: "Cabinet",
    icon: svg(
      <>
        <rect x="4" y="3.5" width="18" height="19" rx="2.5" />
        <path d="M4 13h18M11 8h4M11 18h4" />
      </>,
    ),
  },
  {
    id: "profiles",
    label: "Profiles",
    icon: svg(
      <>
        <circle cx="13" cy="9" r="4" />
        <path d="M5 22c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </>,
    ),
  },
  {
    id: "history",
    label: "History",
    icon: svg(
      <>
        <circle cx="13" cy="13" r="9" />
        <path d="M13 7.5V13l3.5 2.5" />
      </>,
    ),
  },
];

export default function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav className="tabbar chrome" role="tablist" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          className="tab"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}
