import { useState } from "react";
import ScanTab from "./scan/ScanTab";
import TabBar, { type TabId } from "./shell/TabBar";
import { ToastProvider } from "./shell/Toast";
import AddToHomeScreenHint from "./shell/AddToHomeScreenHint";
import UpdateBanner from "./shell/UpdateBanner";
import CabinetPage from "./cabinet/CabinetPage";
import HistoryPage from "./history/HistoryPage";
import ProfilesPage from "./profiles/ProfilesPage";
import "./settings/store"; // applies large-text on load

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
          {tab === "cabinet" && <CabinetPage />}
          {tab === "profiles" && <ProfilesPage />}
          {tab === "history" && <HistoryPage />}
        </div>
        <TabBar active={tab} onChange={choose} />
        <AddToHomeScreenHint />
        <UpdateBanner />
      </div>
    </ToastProvider>
  );
}
