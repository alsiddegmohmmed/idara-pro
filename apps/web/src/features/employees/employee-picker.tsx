import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useEmployees } from "./api";

/** Searchable employee dropdown (name in either language or employee number), limited to what the user may see. */
export function EmployeePicker({ id, value, onChange, excludeId }: { id: string; value: string; onChange: (v: string) => void; excludeId?: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const employees = useEmployees();
  const options = useMemo<ComboboxOption[]>(
    () =>
      (employees.data ?? [])
        .filter((e) => e.id !== excludeId && e.status === "active")
        .map((e) => ({
          value: e.id,
          label: `${i18n.language === "ar" ? e.fullNameAr : e.fullNameEn} · ${e.employeeNo}`,
          keywords: i18n.language === "ar" ? e.fullNameEn : e.fullNameAr,
        })),
    [employees.data, excludeId, i18n.language],
  );
  return <Combobox id={id} value={value} onChange={onChange} options={options} searchPlaceholder={t("employees.form.searchEmployee")} />;
}
