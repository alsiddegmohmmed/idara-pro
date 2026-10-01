import { PERMISSIONS } from "@idara-pro/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import type { LeaveType } from "@/features/leave/api";
import { apiJson, jsonBody } from "@/lib/api";
import { setupError } from "./shared";

type Tier = { days: string; percent: string };

/** أنواع الإجازات: yearly balance, certificate rule and pay tiers per type (sick leave). */
export function LeaveTypesTab(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const list = useQuery({ queryKey: ["leave-types-all"], queryFn: () => apiJson<LeaveType[]>("/api/v1/leave/types/all") });
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const tiersText = (tiers: LeaveType["payTiers"]): string =>
    (tiers ?? [])
      .map((x) => (x.percent === 0 ? t("leave.tiers.unpaid", { count: x.days }) : t("leave.tiers.paid", { count: x.days, percent: x.percent })))
      .join(t("leave.tiers.then"));

  if (list.isLoading) return <Skeleton className="h-40" />;
  if (list.isError) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-3">
      <p className="text-body text-ink-muted">{t("setup.leaveTypes.hint")}</p>
      {list.data?.map((ty) => (
        <Panel key={ty.id} className={ty.active === false ? "opacity-60" : undefined}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-section">{i18n.language === "ar" ? ty.nameAr : ty.nameEn}</h3>
                <Badge tone={ty.paid ? "success" : "neutral"}>{ty.paid ? t("setup.leaveTypes.paid") : t("setup.leaveTypes.unpaid")}</Badge>
                {ty.requiresAttachment && <Badge tone="info">{t("setup.leaveTypes.certificate")}</Badge>}
                {ty.active === false && <Badge tone="neutral">{t("setup.leaveTypes.inactive")}</Badge>}
              </div>
              <p className="text-dense text-ink-muted">
                {ty.deductsBalance ? t("setup.leaveTypes.balance", { count: ty.defaultDays ?? 0 }) : t("setup.leaveTypes.noBalance")}
              </p>
              {ty.payTiers && <p className="text-dense text-ink-muted">{t("leave.tiers.label", { tiers: tiersText(ty.payTiers) })}</p>}
            </div>
            {can(PERMISSIONS.ORG_MANAGE) && (
              <Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => setEditing(ty)}>
                {t("common.edit")}
              </Button>
            )}
          </div>
        </Panel>
      ))}
      {editing && <EditLeaveTypeDialog type={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditLeaveTypeDialog({ type, onClose }: { type: LeaveType; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nameAr, setNameAr] = useState(type.nameAr);
  const [nameEn, setNameEn] = useState(type.nameEn);
  const [days, setDays] = useState(String(type.defaultDays ?? 0));
  const [certificate, setCertificate] = useState(type.requiresAttachment);
  const [active, setActive] = useState(type.active !== false);
  const [tiered, setTiered] = useState(type.payTiers !== null);
  const [tiers, setTiers] = useState<Tier[]>(
    (type.payTiers ?? [{ days: 30, percent: 100 }]).map((x) => ({ days: String(x.days), percent: String(x.percent) })),
  );
  const [error, setError] = useState<string | null>(null);

  const int = (v: string, min: number, max: number): boolean => /^\d{1,3}$/.test(v) && Number(v) >= min && Number(v) <= max;
  const tiersOk = !tiered || (tiers.length > 0 && tiers.every((x) => int(x.days, 1, 366) && int(x.percent, 0, 100)));
  const valid = nameAr.trim().length >= 2 && nameEn.trim().length >= 2 && (!type.deductsBalance || int(days, 0, 366)) && tiersOk;
  const setTier = (i: number, k: keyof Tier, v: string): void => setTiers((all) => all.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = useMutation({
    mutationFn: () =>
      apiJson(`/api/v1/leave/types/${type.id}`, {
        method: "PATCH",
        ...jsonBody({
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          ...(type.deductsBalance ? { defaultDays: Number(days) } : {}),
          requiresAttachment: certificate,
          active,
          payTiers: tiered ? tiers.map((x) => ({ days: Number(x.days), percent: Number(x.percent) })) : null,
        }),
      }),
    onSuccess: async () => {
      toast.success(t("setup.saved"));
      await queryClient.invalidateQueries({ queryKey: ["leave-types-all"] });
      await queryClient.invalidateQueries({ queryKey: ["leave"] });
      onClose();
    },
    onError: (e) => setError(setupError(t, e)),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("setup.leaveTypes.edit")}</DialogTitle>
          <DialogDescription>{t("setup.leaveTypes.editHint")}</DialogDescription>
        </DialogHeader>
        <form
          id="leave-type-form"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (valid) save.mutate();
          }}
        >
          <Field label={t("setup.leaveTypes.nameAr")} htmlFor="lt-ar" required>
            <Input id="lt-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </Field>
          <Field label={t("setup.leaveTypes.nameEn")} htmlFor="lt-en" required>
            <Input id="lt-en" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </Field>
          {type.deductsBalance && (
            <Field label={t("setup.leaveTypes.days")} htmlFor="lt-days" required hint={t("setup.leaveTypes.daysHint")}>
              <Input id="lt-days" dir="ltr" inputMode="numeric" className="w-28" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={certificate} onChange={(e) => setCertificate(e.target.checked)} />
              {t("setup.leaveTypes.requireCertificate")}
            </label>
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={tiered} onChange={(e) => setTiered(e.target.checked)} />
              {t("setup.leaveTypes.useTiers")}
            </label>
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t("setup.leaveTypes.active")}
            </label>
          </div>
          {tiered && (
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="mb-1 text-meta font-medium text-ink-muted">{t("setup.leaveTypes.tiersLegend")}</legend>
              {tiers.map((x, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label={t("setup.leaveTypes.tierDays")} htmlFor={`lt-td-${i}`}>
                    <Input id={`lt-td-${i}`} dir="ltr" inputMode="numeric" className="w-24" value={x.days} onChange={(e) => setTier(i, "days", e.target.value)} />
                  </Field>
                  <Field label={t("setup.leaveTypes.tierPercent")} htmlFor={`lt-tp-${i}`}>
                    <Input id={`lt-tp-${i}`} dir="ltr" inputMode="numeric" className="w-24" value={x.percent} onChange={(e) => setTier(i, "percent", e.target.value)} />
                  </Field>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    disabled={tiers.length === 1}
                    onClick={() => setTiers((all) => all.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {tiers.length < 6 && (
                <Button type="button" size="sm" variant="ghost" icon={<Plus />} onClick={() => setTiers((all) => [...all, { days: "30", percent: "0" }])}>
                  {t("setup.leaveTypes.addTier")}
                </Button>
              )}
              <p className="text-meta text-ink-muted">{t("setup.leaveTypes.tiersHint")}</p>
            </fieldset>
          )}
          {!valid && <Alert className="sm:col-span-2">{t("setup.leaveTypes.invalid")}</Alert>}
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form="leave-type-form" loading={save.isPending} disabled={!valid}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
