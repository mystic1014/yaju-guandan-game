import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GamePage from "../app/page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GamePage />
  </StrictMode>,
);
