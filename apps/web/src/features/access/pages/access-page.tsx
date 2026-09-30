import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeopleTab } from "../people-tab";
import { ReviewTab } from "../review-tab";
import { RolesTab } from "../roles-tab";

const TABS = ["people", "roles", "review"] as const;

/** الصلاحيات: people and their roles, the roles themselves, and the access review. */
export function AccessPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x === params.get("tab")) ?? "people";
  return (
    <div>
        <PageHeader title={t("access.title")} description={t("access.description")} />
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            if (v === "people") next.delete("tab");
            else next.set("tab", v);
            setParams(next, { replace: true });
          }}
        >
          <TabsList>
            {TABS.map((x) => (
              <TabsTrigger key={x} value={x}>
                {t(`access.tabs.${x}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="people">
            <PeopleTab />
          </TabsContent>
          <TabsContent value="roles">
            <RolesTab />
          </TabsContent>
          <TabsContent value="review">
            <ReviewTab />
          </TabsContent>
        </Tabs>
    </div>
  );
}
