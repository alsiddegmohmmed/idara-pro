import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth";
import { DirectionRoot } from "./app/direction-root";
import { router } from "./app/router";
// Self-hosted font (ui-spec §3): no runtime request to Google Fonts; weights 400/500/600 only.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./i18n";
import "./index.css";

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DirectionRoot>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <Toaster />
          </TooltipProvider>
        </DirectionRoot>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
