import { createRoot } from "react-dom/client";
import "../index.css";
import "../shell/shell.css";
import { DataProvider } from "../data/DataProvider";
import Preview from "./Preview";

// Standalone entry for /preview-detail.html (dev only).
createRoot(document.getElementById("root")!).render(
  <DataProvider baseUrl={import.meta.env.VITE_SERVER_URL}>
    <div className="app">
      <Preview />
    </div>
  </DataProvider>,
);
