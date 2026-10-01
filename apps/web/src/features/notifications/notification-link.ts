import type { AppNotification } from "@/lib/types";

/**
 * Where a notification takes its reader. Mirrors the `link` the API puts in the notification email
 * (the stored row has no link column), so a click in the app lands on the same screen as the email.
 * Unknown types return null: the item still marks itself read, it just doesn't navigate.
 */
export function notificationLink(n: AppNotification): string | null {
  const own = n.titleKey.includes(".your_");
  const employeeId = typeof n.bodyParams.employeeId === "string" ? n.bodyParams.employeeId : null;
  switch (n.type) {
    case "iban_approved":
    case "iban_rejected":
    case "document_approved":
    case "document_rejected":
      return "/profile";
    case "document_expiring":
    case "document_expired":
      if (own) return "/profile";
      return employeeId ? `/employees/${employeeId}?tab=documents` : "/employees";
    case "leave_requested":
      return "/leave?tab=approvals";
    case "leave_approved":
    case "leave_rejected":
      return "/leave";
    case "custody_requested":
    case "custody_to_pay":
      return "/custody?tab=manage";
    case "custody_approved":
    case "custody_rejected":
    case "custody_paid":
    case "custody_settled":
      return "/custody";
    case "attendance_missing_checkout":
      return "/my-attendance";
    case "contract_end_soon":
    case "contract_end_passed":
    case "probation_end_soon":
    case "probation_end_passed":
      return n.entity === "employees" ? `/employees/${n.entityId}?tab=contracts` : null;
    case "insurance_end_soon":
    case "insurance_end_passed":
      return n.entity === "employees" ? `/employees/${n.entityId}?tab=insurance` : null;
    case "warning_proposed":
    case "warning_rejected":
      return "/discipline";
    case "warning_issued":
    case "warning_rescinded":
      return "/profile?section=warnings";
    case "shortleave_requested":
      return "/short-permissions?tab=approvals";
    case "shortleave_approved":
    case "shortleave_rejected":
      return "/short-permissions";
    case "adjustment_proposed":
    case "adjustment_approved":
    case "adjustment_rejected":
      return "/adjustments";
    case "payslip_ready":
      return "/payslips";
    default:
      return null;
  }
}
