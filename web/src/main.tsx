import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./shell/shell.css";
import App from "./App.tsx";
import IPhoneFrame from "./shell/IPhoneFrame.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IPhoneFrame>
      {/* TODO: a DataProvider (src/data) will wrap <App /> here */}
      <App />
    </IPhoneFrame>
  </StrictMode>,
);
