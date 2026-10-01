import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { DocumentPreview } from "@/features/employees/document-preview";
import { nameIn } from "@/features/employees/employee-name";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import type { ReviewQueue } from "@/lib/types";
import { useFormCheck } from "@/lib/use-form-check";

const ERROR_KEYS: Record<string, string> = {
  "employees.review.own_submission": "review.errors.ownSubmission",
  "employees.iban.changed": "review.errors.ibanChanged",
  "employees.iban.not_pending": "review.errors.alreadyDecided",
  "employees.document.not_pending": "review.errors.alreadyDecided",
};

/** One row of the queue, whatever its kind. */
interface ReviewItem {
  key: string;
  kind: "iban" | "document";
  employee: { id: string; fullNameAr: string; fullNameEn: string };
  employeeNo?: string;
  /** e.g. "آيبان جديد" / "مستند · جواز السفر" */
  label: string;
  detail: string;
  submittedAt: string;
  isOwn: boolean;
  approvePath: string;
  rejectPath: string;
  /** Sent with both decisions (IBAN: the exact value that was on screen). */
  extraBody: Record<string, string>;
  filePath?: string;
}

function useItems(data: ReviewQueue | undefined): ReviewItem[] {
  const { t } = useTranslation();
  if (!data) return [];
  const ibans: ReviewItem[] = data.ibans.map((i) => ({
    key: `iban-${i.employeeId}`,
    kind: "iban",
    employee: { id: i.employeeId, fullNameAr: i.fullNameAr, fullNameEn: i.fullNameEn },
    employeeNo: i.employeeNo,
    label: t("review.kinds.iban"),
    detail: i.pendingIban,
    submittedAt: i.submittedAt,
    isOwn: i.isOwn,
    approvePath: `/api/v1/employees/${i.employeeId}/iban/approve`,
    rejectPath: `/api/v1/employees/${i.employeeId}/iban/reject`,
    extraBody: { expectedIban: i.pendingIban },
  }));
  const documents: ReviewItem[] = data.documents.map((d) => ({
    key: `doc-${d.id}`,
    kind: "document",
    employee: d.employee,
    label: t("review.kinds.document", { type: t(`documents.types.${d.type}`) }),
    detail: d.number,
    submittedAt: d.createdAt,
    isOwn: d.isOwn,
    approvePath: `/api/v1/employees/${d.employeeId}/documents/${d.id}/approve`,
    rejectPath: `/api/v1/employees/${d.employeeId}/documents/${d.id}/reject`,
    extraBody: {},
    filePath: `/api/v1/review-queue/documents/${d.employeeId}/${d.id}/file`,
  }));
  return [...ibans, ...documents].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** ui-spec §7.5: a table built for acting — visible approve/reject buttons, reject asks for a reason. */
export function ReviewQueuePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"),
  });
  const items = useItems(data);
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const [previewing, setPreviewing] = useState<ReviewItem | null>(null);
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ["review-queue"] });
  const failure = (error: unknown): string => t((error instanceof ApiError && ERROR_KEYS[error.code]) || "review.failed");

  const approve = useMutation({
    mutationFn: (item: ReviewItem) => apiJson(item.approvePath, { method: "POST", ...jsonBody(item.extraBody) }),
    onSuccess: () => {
      toast.success(t("review.approved"));
      setPreviewing(null);
      return refresh();
    },
    onError: (error) => toast.error(failure(error)),
  });

  return (
    <div>
      <PageHeader title={t("review.title")} description={t("review.description")} />

      {isLoading && (
        <div className="space-y-2" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      )}
      {isError && <Alert>{t("common.loadFailed")}</Alert>}
      {data && items.length === 0 && (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("review.empty")} />
        </div>
      )}

      {items.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("review.columns.request")}</TableHead>
              <TableHead>{t("review.columns.employee")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("review.columns.submitted")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("employees.fields.status")}</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-meta text-ink-muted">
                    <bdi className="tabular-nums">{item.detail}</bdi>
                  </p>
                </TableCell>
                <TableCell>
                  <Link to={`/employees/${item.employee.id}`} className="flex items-center gap-3 hover:text-primary">
                    <Avatar name={item.employee.fullNameAr} size="sm" />
                    <span className="truncate font-medium">{nameIn(i18n, item.employee)}</span>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <bdi>{item.submittedAt.slice(0, 10)}</bdi>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge tone="warning">{t("review.status.pending_review")}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {item.filePath && (
                      <Button variant="ghost" size="sm" icon={<Eye />} onClick={() => setPreviewing(item)}>
                        {t("documents.preview")}
                      </Button>
                    )}
                    {item.isOwn ? (
                      <p className="text-meta text-ink-muted">{t("review.ownShort")}</p>
                    ) : (
                      <Decisions
                        pending={approve.isPending && approve.variables?.key === item.key}
                        onApprove={() => approve.mutate(item)}
                        onReject={() => setRejecting(item)}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DocumentPreview
        path={previewing?.filePath ?? null}
        title={previewing ? `${previewing.label} · ${nameIn(i18n, previewing.employee)}` : ""}
        onClose={() => setPreviewing(null)}
        footer={
          previewing &&
          (previewing.isOwn ? (
            <p className="text-meta text-ink-muted">{t("review.ownSubmission")}</p>
          ) : (
            <div className="flex justify-end">
              <Decisions
                pending={approve.isPending}
                onApprove={() => approve.mutate(previewing)}
                onReject={() => {
                  setRejecting(previewing);
                  setPreviewing(null);
                }}
              />
            </div>
          ))
        }
      />

      <RejectDialog
        item={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null);
          void refresh();
        }}
        failure={failure}
      />
    </div>
  );
}

function Decisions({ pending, onApprove, onReject }: { pending: boolean; onApprove: () => void; onReject: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="secondary" size="sm" loading={pending} icon={<Check className="text-success" />} onClick={onApprove}>
        {t("review.approve")}
      </Button>
      <Button variant="secondary" size="sm" className="text-danger" icon={<X />} onClick={onReject}>
        {t("review.reject")}
      </Button>
    </>
  );
}

/** Reject-with-reason: the reason is required and the employee sees it. */
function RejectDialog({
  item,
  onClose,
  onDone,
  failure,
}: {
  item: ReviewItem | null;
  onClose: () => void;
  onDone: () => void;
  failure: (error: unknown) => string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [reason, setReason] = useState("");
  const check = useFormCheck();
  const reject = useMutation({
    mutationFn: (target: ReviewItem) =>
      apiJson(target.rejectPath, { method: "POST", ...jsonBody({ ...target.extraBody, reason: reason.trim() }) }),
    onSuccess: () => {
      toast.success(t("review.rejected"));
      setReason("");
      onDone();
    },
  });
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          check.reset();
          reject.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onBlur={check.onBlur}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!item) return;
            if (!check.submit(Boolean(reason.trim()))) return;
            reject.mutate(item);
          }}
        >
          <DialogHeader>
            <DialogTitle>{item && t("review.rejectTitle", { request: item.label, name: nameIn(i18n, item.employee) })}</DialogTitle>
            <DialogDescription>{t("review.rejectBody")}</DialogDescription>
          </DialogHeader>
          <Field label={t("review.reason")} htmlFor="reject-reason" error={check.show("reject-reason") && !reason.trim() ? t("review.reasonRequired") : undefined}>
            <Textarea
              id="reject-reason"
              rows={4}
              placeholder={t("review.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {reject.isError && <Alert>{failure(reject.error)}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="danger" loading={reject.isPending}>
              {t("review.confirmReject")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
