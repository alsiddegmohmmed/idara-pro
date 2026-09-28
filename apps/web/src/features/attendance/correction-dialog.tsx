import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { nameIn } from "@/features/employees/employee-name";
import { ApiError, apiJson, jsonBody } from "@/lib/api";
import { formatTime, riyadhInstant } from "@/lib/dates";
import type { AttendanceDay, AttendanceStatus, EmployeeRef } from "./api";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "leave", "holiday", "weekend"];

export interface CorrectionTarget {
  employee: EmployeeRef;
  workDate: string;
  day: AttendanceDay | null;
}

const hhmm = (iso: string | null): string => (iso ? formatTime(iso) : "");

/** Manager/HR correction: times and/or status, reason required (business-rules.md "Attendance"). */
export function CorrectionDialog({ target, onClose }: { target: CorrectionTarget | null; onClose: () => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [status, setStatus] = useState<"" | AttendanceStatus>("");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    setInTime(hhmm(target?.day?.firstInAt ?? null));
    setOutTime(hhmm(target?.day?.lastOutAt ?? null));
    setStatus("");
    setReason("");
    setShowErrors(false);
  }, [target]);

  const save = useMutation({
    mutationFn: (t2: CorrectionTarget) =>
      apiJson("/api/v1/attendance/corrections", {
        method: "POST",
        ...jsonBody({
          employeeId: t2.employee.id,
          workDate: t2.workDate,
          firstInAt: inTime ? riyadhInstant(t2.workDate, inTime) : null,
          lastOutAt: outTime ? riyadhInstant(t2.workDate, outTime) : null,
          ...(status ? { status } : {}),
          reason: reason.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success(t("attendance.correction.saved"));
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      onClose();
    },
  });

  const errorText = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : "";
    const known = ["own", "future_date", "invalid_times", "checkout_without_checkin", "time_outside_day"].find((k) => code.endsWith(k));
    if (code === "attendance.out_of_scope") return t("attendance.correction.errors.out_of_scope");
    return known ? t(`attendance.correction.errors.${known}`) : t("attendance.correction.errors.failed");
  };

  const reasonMissing = reason.trim().length < 3;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          save.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!target) return;
            if (reasonMissing) return setShowErrors(true);
            save.mutate(target);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {target && t("attendance.correction.title", { name: nameIn(i18n, target.employee), date: target.workDate })}
            </DialogTitle>
            <DialogDescription>{t("attendance.correction.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("attendance.in")} htmlFor="c-in">
              <Input id="c-in" type="time" dir="ltr" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </Field>
            <Field label={t("attendance.out")} htmlFor="c-out">
              <Input id="c-out" type="time" dir="ltr" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </Field>
          </div>
          <Field label={t("employees.fields.status")} htmlFor="c-status" hint={t("attendance.correction.statusHint")}>
            <NativeSelect id="c-status" value={status} onChange={(e) => setStatus(e.target.value as "" | AttendanceStatus)}>
              <option value="">{t("attendance.correction.statusAuto")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`attendance.status.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("attendance.correction.reason")}
            htmlFor="c-reason"
            error={showErrors && reasonMissing ? t("attendance.correction.reasonRequired") : undefined}
          >
            <Textarea id="c-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {save.isError && <Alert>{errorText(save.error)}</Alert>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" loading={save.isPending}>
              {t("attendance.correction.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
