import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
/* Variable font: one file covering 400-700 rather than four separate
   downloads chained behind the stylesheet. */
import "@fontsource-variable/dm-sans";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
