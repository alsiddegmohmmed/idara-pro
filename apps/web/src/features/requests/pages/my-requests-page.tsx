import { PERMISSIONS } from "@idara-pro/shared";
import { AlarmClock, CalendarDays, Plus, Wallet, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth";
import { MyCustodyTab } from "@/features/custody/pages/custody-page";
import { useMyEmployee } from "@/features/employees/use-my-employee";
import { MyLeaveTab } from "@/features/leave/pages/leave-page";
import { MyShortLeave } from "@/features/shortleave/pages/short-permissions-page";

type Kind = "leave" | "shortleave" | "custody";

const KINDS: Array<{ id: Kind; icon: LucideIcon; permission: string }> = [
  { id: "leave", icon: CalendarDays, permission: PERMISSIONS.LEAVE_REQUEST },
  { id: "shortleave", icon: AlarmClock, permission: PERMISSIONS.SHORTLEAVE_REQUEST },
  { id: "custody", icon: Wallet, permission: PERMISSIONS.CUSTODY_REQUEST },
];

/**
 * "طلباتي": every request the employee made, in one place, and one "طلب جديد" button that asks the
 * type first. Each tab is the module's own "my requests" view (same forms, same rules).
 */
export function MyRequestsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { hasEmployee, isLoading } = useMyEmployee();
  const [params, setParams] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  const kinds = KINDS.filter((k) => can(k.permission));
  const tab = kinds.find((k) => k.id === params.get("type"))?.id ?? kinds[0]?.id ?? "leave";

  const go = (type: Kind, openForm: boolean): void => {
    const next = new URLSearchParams({ type });
    // The tab's own form opens on ?new=1 (lib/use-new-param.ts).
    if (openForm) next.set("new", "1");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div>
      <PageHeader
        title={t("myRequests.title")}
        description={t("myRequests.description")}
        actions={
          hasEmployee && kinds.length > 0 ? (
            <Button icon={<Plus />} onClick={() => setChoosing(true)}>
              {t("myRequests.new")}
            </Button>
          ) : undefined
        }
      />
      {isLoading && <ListSkeleton />}
      {!isLoading && (!hasEmployee || kinds.length === 0) && <Alert tone="info">{t("common.noEmployeeRecord")}</Alert>}
      {!isLoading && hasEmployee && kinds.length > 0 && (
        <Tabs value={tab} onValueChange={(v) => go(v as Kind, false)}>
          <TabsList>
            {kinds.map((k) => (
              <TabsTrigger key={k.id} value={k.id}>
                {t(`myRequests.kinds.${k.id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="leave" className="mt-4">
            <MyLeaveTab />
          </TabsContent>
          <TabsContent value="shortleave" className="mt-4">
            <MyShortLeave />
          </TabsContent>
          <TabsContent value="custody" className="mt-4">
            <MyCustodyTab />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("myRequests.chooseTitle")}</DialogTitle>
            <DialogDescription>{t("myRequests.chooseBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setChoosing(false);
                  go(k.id, true);
                }}
                className="flex items-center gap-3 rounded-control border border-line p-3 text-start hover:border-primary hover:bg-canvas"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <k.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{t(`myRequests.kinds.${k.id}`)}</span>
                  <span className="block text-meta text-ink-muted">{t(`myRequests.hints.${k.id}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
