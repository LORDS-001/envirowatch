import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { NotFoundPage } from "@/features/placeholder/StatusPage";
import { RequireAuth, RequireRole } from "./guards";
import { RouteError } from "./RouteError";

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  { path: "/login", lazy: page(() => import("@/features/auth/LoginPage")) },
  {
    path: "/public",
    lazy: page(() => import("@/features/public/PublicLayout")),
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import("@/features/public/PublicHomePage")) },
      { path: "map", lazy: page(() => import("@/features/public/PublicMapPage")) },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/overview" replace /> },
          { path: "overview", lazy: page(() => import("@/features/overview/OverviewPage")) },
          { path: "map", lazy: page(() => import("@/features/map/MapPage")) },
          { path: "analytics", lazy: page(() => import("@/features/analytics/AnalyticsPage")) },
          { path: "alerts/:id?", lazy: page(() => import("@/features/alerts/AlertsPage")) },
          { path: "health", lazy: page(() => import("@/features/health/HealthPage")) },
          { path: "devices", lazy: page(() => import("@/features/devices/DevicesPage")) },
          { path: "devices/:id", lazy: page(() => import("@/features/devices/DeviceDetailPage")) },
          { path: "reports", lazy: page(() => import("@/features/reports/ReportsPage")) },
          {
            element: <RequireRole allow="admin" />,
            children: [
              { path: "settings/*", lazy: page(() => import("@/features/settings/SettingsPage")) },
              { path: "simulator", lazy: page(() => import("@/features/simulator/SimulatorPage")) },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
