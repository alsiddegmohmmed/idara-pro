import { createBrowserRouter } from "react-router-dom";
import { LoginPage } from "@/features/auth/pages/login-page";
import { AppShell } from "./app-shell";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [{ index: true, element: <LoginPage /> }],
  },
]);
