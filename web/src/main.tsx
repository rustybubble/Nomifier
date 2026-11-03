import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./shell/shell.css";
import App from "./App.tsx";
import IPhoneFrame from "./shell/IPhoneFrame.tsx";
import { DataProvider } from "./data/DataProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IPhoneFrame>
      <DataProvider>
        <App />
      </DataProvider>
    </IPhoneFrame>
  </StrictMode>,
);
