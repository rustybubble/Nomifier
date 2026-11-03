import { useState, type ReactNode } from "react";
import ScanTab from "./scan/ScanTab";
import TabBar, { type TabId } from "./shell/TabBar";
import Page from "./shell/Page";
import { ToastProvider } from "./shell/Toast";
import AddToHomeScreenHint from "./shell/AddToHomeScreenHint";
import UpdateBanner from "./shell/UpdateBanner";

const KEY = "nomifier.tab";
const IDS: TabId[] = ["scan", "cabinet", "profiles", "history"];

function loadTab(): TabId {
  try {
    const v = localStorage.getItem(KEY) as TabId | null;
    if (v && IDS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "scan";
}

const Empty = ({ icon, text }: { icon: ReactNode; text: string }) => (
  <div className="empty chrome">
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
    <b>Coming soon</b>
    <span>{text}</span>
  </div>
);

export default function App() {
  const [tab, setTab] = useState<TabId>(loadTab);
  const choose = (t: TabId) => {
    setTab(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <ToastProvider>
      <div className="app">
        <div
          className="app-main"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "scan" && (
            <div className="scan-pane">
              <ScanTab />
            </div>
          )}
          {tab === "cabinet" && (
            <Page title="Cabinet">
              <Empty
                text="Medicines you have scanned will live here."
                icon={
                  <>
                    <rect x="4" y="3.5" width="18" height="19" rx="2.5" />
                    <path d="M4 13h18M11 8h4M11 18h4" />
                  </>
                }
              />
            </Page>
          )}
          {tab === "profiles" && (
            <Page title="Profiles">
              <Empty
                text="Who is this medicine for? Profiles go here."
                icon={
                  <>
                    <circle cx="13" cy="9" r="4" />
                    <path d="M5 22c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                  </>
                }
              />
            </Page>
          )}
          {tab === "history" && (
            <Page title="History">
              <Empty
                text="Your past scans will show up here."
                icon={
                  <>
                    <circle cx="13" cy="13" r="9" />
                    <path d="M13 7.5V13l3.5 2.5" />
                  </>
                }
              />
            </Page>
          )}
        </div>
        <TabBar active={tab} onChange={choose} />
        <AddToHomeScreenHint />
        <UpdateBanner />
      </div>
    </ToastProvider>
  );
}
