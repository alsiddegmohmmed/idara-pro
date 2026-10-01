import { PERMISSIONS, type AdjustmentView, type PayrollRunView, type ShortLeaveView, type WarningView } from "@idara-pro/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { useLeaveRequests, type LeaveRequest } from "@/features/leave/api";
import { apiJson } from "@/lib/api";
import type { ReviewQueue } from "@/lib/types";

/**
 * Everything waiting on the signed-in user, by queue. One source for the sidebar badges and the
 * dashboard's "يحتاج إجراءك" list. Query keys match the pages that show each queue, so deciding an
 * item there (which invalidates that key) updates the badge and the dashboard at once.
 * Each count is what the API says *this* user can act on (canDecide / actions), not just "pending".
 */
export type AttentionKey = "reviews" | "leave" | "shortleave" | "custody" | "warnings" | "adjustments" | "payroll";

export interface Attention {
  counts: Record<AttentionKey, number>;
  total: number;
  isLoading: boolean;
  /** The queues themselves, for the inbox (same cache entries as the module pages). */
  data: {
    reviews?: ReviewQueue;
    leave?: LeaveRequest[];
    shortleave?: ShortLeaveView[];
    custody?: CustodyItem[];
    warnings?: WarningView[];
    adjustments?: AdjustmentView[];
    payroll?: PayrollRunView[];
  };
}

/** The fields of a custody request the inbox needs (the custody page has the full shape). */
export interface CustodyItem {
  id: string;
  employee: { id: string; employeeNo: string; fullNameAr: string; fullNameEn: string } | null;
  amountHalalas: string;
  purpose: string;
  status: string;
  createdAt: string;
  actions?: string[];
}

const POLL = { refetchInterval: 60_000 } as const;

export function useAttention(): Attention {
  const { can } = useAuth();

  const reviews = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"),
    enabled: can(PERMISSIONS.EMPLOYEES_REVIEW),
    ...POLL,
  });
  const leave = useLeaveRequests({ status: "pending" }, can(PERMISSIONS.LEAVE_APPROVE));
  const shortleave = useQuery({
    queryKey: ["shortleave", "list", "pending"],
    queryFn: () => apiJson<ShortLeaveView[]>("/api/v1/shortleave/requests?status=pending"),
    enabled: can(PERMISSIONS.SHORTLEAVE_APPROVE),
    ...POLL,
  });
  const custody = useQuery({
    queryKey: ["custody", "list", ""],
    queryFn: () => apiJson<CustodyItem[]>("/api/v1/custody/requests"),
    enabled: can(PERMISSIONS.CUSTODY_APPROVE) || can(PERMISSIONS.CUSTODY_PAY) || can(PERMISSIONS.CUSTODY_SETTLE),
    ...POLL,
  });
  const warnings = useQuery({
    queryKey: ["warnings", "proposed", ""],
    queryFn: () => apiJson<WarningView[]>("/api/v1/warnings?status=proposed"),
    enabled: can(PERMISSIONS.WARNINGS_ISSUE),
    ...POLL,
  });
  const adjustments = useQuery({
    queryKey: ["adjustments", "pending"],
    queryFn: () => apiJson<AdjustmentView[]>("/api/v1/adjustments?status=proposed"),
    enabled: can(PERMISSIONS.ADJUSTMENTS_APPROVE),
    ...POLL,
  });
  const payroll = useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: () => apiJson<PayrollRunView[]>("/api/v1/payroll-runs"),
    enabled: can(PERMISSIONS.PAYROLL_APPROVE),
    ...POLL,
  });

  const counts: Record<AttentionKey, number> = {
    reviews: reviews.data ? reviews.data.ibans.filter((i) => !i.isOwn).length + reviews.data.documents.filter((d) => !d.isOwn).length : 0,
    leave: (leave.data ?? []).filter((r) => r.canDecide).length,
    shortleave: (shortleave.data ?? []).filter((r) => r.canDecide).length,
    custody: (custody.data ?? []).filter((c) => (c.actions ?? []).length > 0).length,
    warnings: (warnings.data ?? []).filter((w) => w.actions.includes("issue")).length,
    adjustments: (adjustments.data ?? []).filter((a) => a.status === "proposed" && a.canDecide).length,
    payroll: (payroll.data ?? []).filter((r) => r.canApprove).length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const isLoading = [reviews, leave, shortleave, custody, warnings, adjustments, payroll].some((q) => q.isLoading);
  return {
    counts,
    total,
    isLoading,
    data: {
      reviews: reviews.data,
      leave: leave.data,
      shortleave: shortleave.data,
      custody: custody.data,
      warnings: warnings.data,
      adjustments: adjustments.data,
      payroll: payroll.data,
    },
  };
}
