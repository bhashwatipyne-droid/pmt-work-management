import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import "@/styles/mint-tokens.css";
import App from "@/App";
import { prefetchForPath } from "@/services/prefetch";
import { initAnalytics } from "@/analytics";
import { installApiTelemetry } from "@/services/apiTelemetry";

// PostHog loads after first paint (see analytics.js); events are queued until
// then. The API telemetry goes in first so it also sees the prefetches below.
initAnalytics();
installApiTelemetry();

// Start the opened page's data requests and download its code right now, in
// parallel with the "who am I" check, instead of waiting for that check to
// finish and the page to render first (Work Sheet, Home, Planning, ...).
prefetchForPath(window.location.pathname);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);