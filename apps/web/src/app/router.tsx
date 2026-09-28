import { PERMISSIONS } from "@idara-pro/shared";
import { createBrowserRouter } from "react-router-dom";
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  LoginPage,
  RequireAuth,
  ResetPasswordPage,
} from "@/features/auth";
import { EmployeeDetailPage } from "@/features/employees/pages/employee-detail-page";
import { EmployeeFormPage } from "@/features/employees/pages/employee-form-page";
import { EmployeesListPage } from "@/features/employees/pages/employees-list-page";
import { MyProfilePage } from "@/features/profile/pages/my-profile-page";
import { ReviewQueuePage } from "@/features/review/pages/review-queue-page";
import { AppShell } from "./app-shell";
import { HomePage } from "./home-page";

const guarded = (permission: string, element: React.JSX.Element): React.JSX.Element => (
  <RequireAuth permission={permission}>{element}</RequireAuth>
);

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
      { path: "accept-invitation", element: <AcceptInvitationPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "employees", element: guarded(PERMISSIONS.EMPLOYEES_READ, <EmployeesListPage />) },
      { path: "employees/new", element: guarded(PERMISSIONS.EMPLOYEES_CREATE, <EmployeeFormPage />) },
      { path: "employees/:id", element: guarded(PERMISSIONS.EMPLOYEES_READ, <EmployeeDetailPage />) },
      { path: "employees/:id/edit", element: guarded(PERMISSIONS.EMPLOYEES_UPDATE, <EmployeeFormPage />) },
      { path: "review-queue", element: guarded(PERMISSIONS.EMPLOYEES_REVIEW, <ReviewQueuePage />) },
      { path: "profile", element: guarded(PERMISSIONS.EMPLOYEES_SELF_SERVICE, <MyProfilePage />) },
    ],
  },
]);
