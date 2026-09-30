import { PERMISSIONS } from "@idara-pro/shared";
import { LocateFixed } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { useAuth } from "@/features/auth";
import { useCrud, type Branch, type WorkSchedule } from "./api";
import { FormDialog, SetupTable, setupError } from "./shared";

const empty = { name: "", lat: "", lng: "", radiusM: "150", defaultScheduleId: "", technoLinkBranchCode: "" };

/** Reads "24.7136, 46.6753" or a Google Maps link (…@24.71,46.67… or …q=24.71,46.67…). */
function parseCoordinates(text: string): { lat: string; lng: string } | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: m[1] as string, lng: m[2] as string } : null;
}

/** الفروع: each branch is a separate business with its own check-in location (GPS point + radius). */
export function BranchesTab(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { list, save, remove } = useCrud<Branch>("branches");
  const schedules = useCrud<WorkSchedule>("work-schedules").list;
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const open = (b: Branch | "new") => {
    setError(null);
    setEditing(b);
    setForm(
      b === "new"
        ? empty
        : {
            name: b.name,
            lat: String(b.lat),
            lng: String(b.lng),
            radiusM: String(b.radiusM),
            defaultScheduleId: b.defaultScheduleId ?? "",
            technoLinkBranchCode: b.technoLinkBranchCode ?? "",
          },
    );
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error(t("setup.branches.noGeolocation"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
      },
      () => {
        setLocating(false);
        toast.error(t("setup.branches.locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  const radius = Number(form.radiusM);
  const valid =
    form.name.trim() !== "" && form.lat !== "" && form.lng !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isInteger(radius) && radius > 0;
  const scheduleName = (id: string | null) => schedules.data?.find((s) => s.id === id)?.name ?? "—";

  return (
    <>
      <SetupTable
        rows={list.data}
        loading={list.isLoading}
        failed={list.isError}
        canManage={can(PERMISSIONS.ORG_MANAGE)}
        addLabel={t("setup.branches.add")}
        onAdd={() => open("new")}
        onEdit={open}
        onDelete={(b) => remove.mutateAsync(b.id)}
        columns={[
          { header: t("setup.branches.name"), cell: (b) => <span className="font-medium">{b.name}</span> },
          {
            header: t("setup.branches.location"),
            cell: (b) => (
              <a className="tabular-nums underline underline-offset-2" dir="ltr" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${b.lat},${b.lng}`}>
                {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
              </a>
            ),
          },
          { header: t("setup.branches.radius"), cell: (b) => <span className="tabular-nums">{t("setup.branches.meters", { count: b.radiusM })}</span> },
          { header: t("setup.branches.schedule"), cell: (b) => scheduleName(b.defaultScheduleId) },
        ]}
      />
      <FormDialog
        title={editing === "new" ? t("setup.branches.add") : t("setup.branches.edit")}
        formId="branch-form"
        open={editing !== null}
        onClose={() => setEditing(null)}
        saving={save.isPending}
        canSave={valid}
        error={error}
        onSubmit={() =>
          save.mutate(
            {
              id: editing === "new" || editing === null ? undefined : editing.id,
              body: {
                name: form.name.trim(),
                lat,
                lng,
                radiusM: radius,
                defaultScheduleId: form.defaultScheduleId || null,
                technoLinkBranchCode: form.technoLinkBranchCode.trim() || null,
              },
            },
            {
              onSuccess: () => {
                toast.success(t("setup.saved"));
                setEditing(null);
              },
              onError: (e) => setError(setupError(t, e)),
            },
          )
        }
      >
        <div className="sm:col-span-2">
          <Field label={t("setup.branches.name")} htmlFor="b-name">
            <Input id="b-name" required value={form.name} onChange={set("name")} />
          </Field>
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Field label={t("setup.branches.paste")} htmlFor="b-paste" hint={t("setup.branches.pasteHint")}>
            <Input
              id="b-paste"
              dir="ltr"
              placeholder="https://maps.google.com/?q=24.7136,46.6753"
              onChange={(e) => {
                const c = parseCoordinates(e.target.value);
                if (c) setForm((f) => ({ ...f, ...c }));
              }}
            />
          </Field>
          <Button type="button" variant="secondary" size="sm" icon={<LocateFixed />} loading={locating} onClick={useMyLocation}>
            {t("setup.branches.useMyLocation")}
          </Button>
        </div>
        <Field label={t("setup.branches.lat")} htmlFor="b-lat">
          <Input id="b-lat" dir="ltr" inputMode="decimal" required value={form.lat} onChange={set("lat")} />
        </Field>
        <Field label={t("setup.branches.lng")} htmlFor="b-lng">
          <Input id="b-lng" dir="ltr" inputMode="decimal" required value={form.lng} onChange={set("lng")} />
        </Field>
        <Field label={t("setup.branches.radius")} htmlFor="b-radius" hint={t("setup.branches.radiusHint")}>
          <Input id="b-radius" dir="ltr" inputMode="numeric" required value={form.radiusM} onChange={set("radiusM")} />
        </Field>
        <Field label={t("setup.branches.schedule")} htmlFor="b-schedule">
          <NativeSelect id="b-schedule" value={form.defaultScheduleId} onChange={set("defaultScheduleId")}>
            <option value="">—</option>
            {schedules.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("setup.branches.technoLink")} htmlFor="b-tl" hint={t("setup.branches.technoLinkHint")}>
            <Input id="b-tl" dir="ltr" value={form.technoLinkBranchCode} onChange={set("technoLinkBranchCode")} />
          </Field>
        </div>
        {valid && (
          <p className="sm:col-span-2 text-meta">
            <a className="underline underline-offset-2" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${lat},${lng}`}>
              {t("setup.branches.checkOnMap")}
            </a>
          </p>
        )}
      </FormDialog>
    </>
  );
}
