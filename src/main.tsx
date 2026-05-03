import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentryRenderer } from "./lib/sentry-renderer";
import "../app.css";

// Sentry renderer — OPT-IN: only initializes if user consented
initSentryRenderer();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
