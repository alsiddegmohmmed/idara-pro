import { PERMISSIONS } from "@idara-pro/shared";
import { createBrowserRouter } from "react-router-dom";
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  LoginPage,
  RequirePermission,
  ResetPasswordPage,
} from "@/features/auth";
import { AccessPage } from "@/features/access/pages/access-page";
import { SetupPage } from "@/features/setup/pages/setup-page";
import { AuditPage } from "@/features/audit/pages/audit-page";
import { AttendancePage } from "@/features/attendance/pages/attendance-page";
import { MyAttendancePage } from "@/features/attendance/pages/my-attendance-page";
import { CustodyPage } from "@/features/custody/pages/custody-page";
import { LeavePage } from "@/features/leave/pages/leave-page";
import { WarningsPage } from "@/features/discipline/warnings";
import { ShortPermissionsPage } from "@/features/shortleave/pages/short-permissions-page";
import { AdjustmentsPage } from "@/features/adjustments/pages/adjustments-page";
import { MyPayslipsPage, PayrollPage, PayrollRunPage } from "@/features/payroll/pages/payroll-page";
import { EmployeeDetailPage } from "@/features/employees/pages/employee-detail-page";
import { EmployeeFormPage } from "@/features/employees/pages/employee-form-page";
import { EmployeesListPage } from "@/features/employees/pages/employees-list-page";
import { MyProfilePage } from "@/features/profile/pages/my-profile-page";
import { ReviewQueuePage } from "@/features/review/pages/review-queue-page";
import { InboxPage } from "@/features/inbox/pages/inbox-page";
import { MyRequestsPage } from "@/features/requests/pages/my-requests-page";
import { ProtectedLayout, PublicLayout } from "./app-shell";
import { INBOX_PERMISSIONS, PAYROLL_TABS, REQUEST_PERMISSIONS, SETTINGS_TABS, type SectionTab } from "./shell/nav-items";
import { FirstAllowedTab, SectionTabs } from "./shell/section-tabs";
import { HomePage } from "./home-page";
import { NotFoundPage } from "@/components/status-pages";

const guarded = (permission: string | string[], element: React.JSX.Element): React.JSX.Element => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

const inSection = (tabs: SectionTab[], element: React.JSX.Element): React.JSX.Element => <SectionTabs tabs={tabs}>{element}</SectionTabs>;

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
      { path: "inbox", element: guarded(INBOX_PERMISSIONS, <InboxPage />) },
      { path: "my-requests", element: guarded(REQUEST_PERMISSIONS, <MyRequestsPage />) },
      { path: "settings", element: <FirstAllowedTab tabs={SETTINGS_TABS} /> },
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
      {
        path: "short-permissions",
        element: guarded([PERMISSIONS.SHORTLEAVE_REQUEST, PERMISSIONS.SHORTLEAVE_READ], <ShortPermissionsPage />),
      },
      { path: "discipline", element: guarded(PERMISSIONS.WARNINGS_READ, <WarningsPage />) },
      { path: "adjustments", element: guarded(PERMISSIONS.ADJUSTMENTS_READ, inSection(PAYROLL_TABS, <AdjustmentsPage />)) },
      { path: "payroll", element: guarded(PERMISSIONS.PAYROLL_READ, inSection(PAYROLL_TABS, <PayrollPage />)) },
      { path: "payroll/:id", element: guarded(PERMISSIONS.PAYROLL_READ, <PayrollRunPage />) },
      { path: "payslips", element: guarded(PERMISSIONS.EMPLOYEES_SELF_SERVICE, <MyPayslipsPage />) },
      { path: "access", element: guarded(PERMISSIONS.ACCESS_READ, inSection(SETTINGS_TABS, <AccessPage />)) },
      { path: "setup", element: guarded(PERMISSIONS.ORG_READ, inSection(SETTINGS_TABS, <SetupPage />)) },
      { path: "audit", element: guarded(PERMISSIONS.AUDIT_READ, inSection(SETTINGS_TABS, <AuditPage />)) },
      // Dev-only primitive gallery (docs/design/ui-spec.md §10 review); not routed in production builds.
      ...(import.meta.env.DEV
        ? [{ path: "ui-kit", lazy: async () => ({ Component: (await import("./ui-kit-page")).UiKitPage }) }]
        : []),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
