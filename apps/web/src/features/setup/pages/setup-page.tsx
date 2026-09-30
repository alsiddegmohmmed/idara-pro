import { PERMISSIONS } from "@idara-pro/shared";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth";
import { BranchesTab } from "../branches-tab";
import { DepartmentsTab } from "../departments-tab";
import { HolidaysTab } from "../holidays-tab";
import { InsurancePoliciesTab } from "../insurance-tab";
import { SchedulesTab } from "../schedules-tab";
import { SettingsTab } from "../settings-tab";

/** إعداد الشركة: branches (separate businesses), departments, work schedules, holidays and policies. */
export function SetupPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: "branches", show: true },
    // The departments list is read with employees:read on the API.
    { id: "departments", show: can(PERMISSIONS.EMPLOYEES_READ) },
    { id: "schedules", show: true },
    { id: "holidays", show: true },
    { id: "insurance", show: can(PERMISSIONS.INSURANCE_READ) },
    { id: "settings", show: true },
  ].filter((x) => x.show);
  const tab = tabs.find((x) => x.id === params.get("tab"))?.id ?? "branches";
  return (
    <div>
      <PageHeader title={t("setup.title")} description={t("setup.description")} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "branches") next.delete("tab");
          else next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          {tabs.map((x) => (
            <TabsTrigger key={x.id} value={x.id}>
              {t(`setup.tabs.${x.id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="branches">
          <BranchesTab />
        </TabsContent>
        {tabs.some((x) => x.id === "departments") && (
          <TabsContent value="departments">
            <DepartmentsTab />
          </TabsContent>
        )}
        <TabsContent value="schedules">
          <SchedulesTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
        {tabs.some((x) => x.id === "insurance") && (
          <TabsContent value="insurance">
            <InsurancePoliciesTab />
          </TabsContent>
        )}
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
