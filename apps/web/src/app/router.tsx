import { createBrowserRouter } from "react-router-dom";
import { LoginPage, RequireAuth } from "@/features/auth";
import { AppShell } from "./app-shell";
import { HomePage } from "./home-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        ),
      },
      { path: "login", element: <LoginPage /> },
    ],
  },
]);
