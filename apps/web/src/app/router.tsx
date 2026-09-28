import { PERMISSIONS } from "@idara-pro/shared";
import { createBrowserRouter } from "react-router-dom";
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  LoginPage,
  RequirePermission,
  ResetPasswordPage,
} from "@/features/auth";
import { AttendancePage } from "@/features/attendance/pages/attendance-page";
import { MyAttendancePage } from "@/features/attendance/pages/my-attendance-page";
import { CustodyPage } from "@/features/custody/pages/custody-page";
import { LeavePage } from "@/features/leave/pages/leave-page";
import { EmployeeDetailPage } from "@/features/employees/pages/employee-detail-page";
import { EmployeeFormPage } from "@/features/employees/pages/employee-form-page";
import { EmployeesListPage } from "@/features/employees/pages/employees-list-page";
import { MyProfilePage } from "@/features/profile/pages/my-profile-page";
import { ReviewQueuePage } from "@/features/review/pages/review-queue-page";
import { ProtectedLayout, PublicLayout } from "./app-shell";
import { HomePage } from "./home-page";
import { NotFoundPage } from "@/components/status-pages";

const guarded = (permission: string | string[], element: React.JSX.Element): React.JSX.Element => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

export const router = createBrowserRouter([
  // The sign-in family: never the app shell.
  {
    element: <PublicLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "accept-invitation", element: <AcceptInvitationPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  // Everything else needs a session; each page also checks its own permission.
  {
    path: "/",
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "employees", element: guarded(PERMISSIONS.EMPLOYEES_READ, <EmployeesListPage />) },
      { path: "employees/new", element: guarded(PERMISSIONS.EMPLOYEES_CREATE, <EmployeeFormPage />) },
      { path: "employees/:id", element: guarded(PERMISSIONS.EMPLOYEES_READ, <EmployeeDetailPage />) },
      { path: "employees/:id/edit", element: guarded(PERMISSIONS.EMPLOYEES_UPDATE, <EmployeeFormPage />) },
      { path: "review-queue", element: guarded(PERMISSIONS.EMPLOYEES_REVIEW, <ReviewQueuePage />) },
      { path: "profile", element: guarded(PERMISSIONS.EMPLOYEES_SELF_SERVICE, <MyProfilePage />) },
      { path: "attendance", element: guarded(PERMISSIONS.ATTENDANCE_READ, <AttendancePage />) },
      { path: "my-attendance", element: guarded(PERMISSIONS.ATTENDANCE_PUNCH, <MyAttendancePage />) },
      {
        path: "leave",
        element: guarded([PERMISSIONS.LEAVE_REQUEST, PERMISSIONS.LEAVE_READ], <LeavePage />),
      },
      {
        path: "custody",
        element: guarded([PERMISSIONS.CUSTODY_REQUEST, PERMISSIONS.CUSTODY_READ], <CustodyPage />),
      },
      // Dev-only primitive gallery (docs/design/ui-spec.md §10 review); not routed in production builds.
      ...(import.meta.env.DEV
        ? [{ path: "ui-kit", lazy: async () => ({ Component: (await import("./ui-kit-page")).UiKitPage }) }]
        : []),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
