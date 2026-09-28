import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import type { ReviewQueue } from "@/lib/types";
import { downloadFile } from "@/features/employees/pages/employee-detail-page";

const ERROR_KEYS: Record<string, string> = {
  "employees.review.own_submission": "review.errors.ownSubmission",
  "employees.iban.changed": "review.errors.ibanChanged",
  "employees.iban.not_pending": "review.errors.alreadyDecided",
  "employees.document.not_pending": "review.errors.alreadyDecided",
};

/** Specific message for the known refusals (own submission, stale IBAN, already decided), generic otherwise. */
function useFailureMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error) => t((error instanceof ApiError && ERROR_KEYS[error.code]) || "review.failed");
}

/** Approve is one click; Reject opens a reason box — the reason is mandatory and the employee sees it. */
function DecisionButtons({
  approvePath,
  rejectPath,
  extraBody,
  onDone,
}: {
  approvePath: string;
  rejectPath: string;
  /** Sent with both decisions (IBAN: the exact value that was on screen). */
  extraBody?: Record<string, string>;
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const failure = useFailureMessage();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const approve = useMutation({ mutationFn: () => apiJson(approvePath, { method: "POST", ...jsonBody({ ...extraBody }) }), onSuccess: onDone });
  const reject = useMutation({
    mutationFn: () => apiJson(rejectPath, { method: "POST", ...jsonBody({ ...extraBody, reason: reason.trim() }) }),
    onSuccess: onDone,
  });

  if (rejecting) {
    return (
      <form
        className="w-full space-y-2 md:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) reject.mutate();
        }}
      >
        <Textarea
          aria-label={t("review.reason")}
          placeholder={t("review.reasonPlaceholder")}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={reject.isPending || !reason.trim()}>{t("review.confirmReject")}</Button>
          <Button type="button" variant="outline" onClick={() => setRejecting(false)}>{t("common.cancel")}</Button>
        </div>
        {(reject.isError || approve.isError) && (
          <p role="alert" className="text-sm text-destructive">{failure(reject.error ?? approve.error)}</p>
        )}
      </form>
    );
  }
  return (
    <div className="flex gap-2">
      <Button onClick={() => approve.mutate()} disabled={approve.isPending}>{t("review.approve")}</Button>
      <Button variant="outline" onClick={() => setRejecting(true)}>{t("review.reject")}</Button>
      {approve.isError && <p role="alert" className="self-center text-sm text-destructive">{failure(approve.error)}</p>}
    </div>
  );
}

export function ReviewQueuePage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => apiJson<ReviewQueue>("/api/v1/review-queue"),
  });
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
  const nameOf = (e: { fullNameAr: string; fullNameEn: string }): string => (i18n.language === "ar" ? e.fullNameAr : e.fullNameEn);

  const empty = data && data.ibans.length === 0 && data.documents.length === 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("review.title")}</h1>
      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {isError && <p role="alert" className="text-destructive">{t("common.loadFailed")}</p>}
      {empty && (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">{t("review.empty")}</p>
      )}

      {data && data.ibans.length > 0 && (
        <Card>
          <CardTitle>{t("review.ibans")}</CardTitle>
          <ul className="divide-y divide-border">
            {data.ibans.map((i) => (
              <li key={i.employeeId} className="flex flex-wrap items-start justify-between gap-4 py-3">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{nameOf(i)} <span className="text-muted-foreground" dir="ltr">({i.employeeNo})</span></p>
                  <p><span className="text-muted-foreground">{t("review.newIban")}: </span><bdi dir="ltr" className="font-mono">{i.pendingIban}</bdi></p>
                  <p className="text-muted-foreground">
                    {i.currentIbanLast4 ? t("review.currentIban", { last4: i.currentIbanLast4 }) : t("review.noCurrentIban")}
                  </p>
                </div>
                {i.isOwn ? (
                  <p className="text-sm text-muted-foreground">{t("review.ownSubmission")}</p>
                ) : (
                  <DecisionButtons
                    approvePath={`/api/v1/employees/${i.employeeId}/iban/approve`}
                    rejectPath={`/api/v1/employees/${i.employeeId}/iban/reject`}
                    extraBody={{ expectedIban: i.pendingIban }}
                    onDone={refresh}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.documents.length > 0 && (
        <Card>
          <CardTitle>{t("review.documents")}</CardTitle>
          <ul className="divide-y divide-border">
            {data.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{nameOf(d.employee)}</p>
                  <p>
                    {t(`documents.types.${d.type}`)} · <bdi dir="ltr">{d.number}</bdi>{" "}
                    <Badge tone="pending">{t("review.status.pending_review")}</Badge>
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => void downloadFile(`/api/v1/review-queue/documents/${d.employeeId}/${d.id}/file`, d.originalFilename)}
                  >
                    {t("documents.download")} — {d.originalFilename}
                  </button>
                </div>
                {d.isOwn ? (
                  <p className="text-sm text-muted-foreground">{t("review.ownSubmission")}</p>
                ) : (
                  <DecisionButtons
                    approvePath={`/api/v1/employees/${d.employeeId}/documents/${d.id}/approve`}
                    rejectPath={`/api/v1/employees/${d.employeeId}/documents/${d.id}/reject`}
                    onDone={refresh}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
