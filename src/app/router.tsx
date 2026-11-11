import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { NotFoundPage } from "@/features/placeholder/StatusPage";
import { planned } from "@/features/placeholder/PlannedPage";
import { RequireAuth, RequireRole } from "./guards";
import { RouteError } from "./RouteError";

export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/features/auth/LoginPage")).default }),
  },
  {
    path: "/public/*",
    lazy: async () => ({ Component: (await import("@/features/public/PublicPlaceholder")).default }),
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/overview" replace /> },
          {
            path: "overview",
            lazy: async () => ({ Component: (await import("@/features/overview/OverviewPage")).default }),
          },
          {
            path: "map",
            lazy: async () =>
              planned("Environmental map", 3, "A full-screen IDW heat map with site markers, a metric picker and a time scrubber."),
          },
          {
            path: "analytics",
            lazy: async () =>
              planned("Historical analytics", 3, "Filterable history with quality markers, aggregates and a virtualised readings table."),
          },
          {
            path: "alerts/:id?",
            lazy: async () =>
              planned("Alerts", 4, "Every alert with its lifecycle timeline, nearby sensors and the Acknowledge action."),
          },
          {
            path: "health",
            lazy: async () =>
              planned("Sensor health", 4, "Silent, drifting and suspicious sensors, plus queue depth and latency."),
          },
          {
            path: "devices/:id?",
            lazy: async () =>
              planned("Devices", 4, "Register, edit, deactivate devices and rotate their keys."),
          },
          {
            path: "reports",
            lazy: async () => planned("Reports", 5, "CSV and PDF exports with units, time range and quality notes."),
          },
          {
            element: <RequireRole allow="admin" />,
            children: [
              {
                path: "settings/*",
                lazy: async () => planned("Settings", 5, "Users and roles, sites, alert rules and retention."),
              },
              {
                path: "simulator",
                lazy: async () =>
                  planned("Simulator", 5, "Run fault-injection scenarios and compare detections with ground truth."),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
