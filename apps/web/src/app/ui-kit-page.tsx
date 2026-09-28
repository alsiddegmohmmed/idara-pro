import { MoreHorizontal, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Dev-only gallery of the ui-spec §5 primitives, for browser review and screenshots. */
export function UiKitPage(): React.JSX.Element {
  const { t } = useTranslation();
  const k = (key: string): string => t(`uiKit.${key}`);
  const rows = [
    { name: k("sampleName1"), no: "E-104", status: <Badge tone="success" dot>{k("active")}</Badge> },
    { name: k("sampleName2"), no: "E-117", status: <Badge tone="info" dot>{k("invited")}</Badge> },
    { name: k("sampleName3"), no: "E-121", status: <Badge tone="neutral" dot>{k("inactive")}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title">{k("title")}</h1>
        <p className="text-body text-ink-muted">{k("description")}</p>
      </div>

      <Panel>
        <PanelHeader title={k("buttons")} />
        <div className="flex flex-wrap items-center gap-3">
          <Button>{k("saveChanges")}</Button>
          <Button variant="secondary" icon={<Send />}>
            {k("sendInvitation")}
          </Button>
          <Button variant="ghost">{k("cancel")}</Button>
          <Button variant="danger" icon={<Trash2 />}>
            {k("deleteDocument")}
          </Button>
          <Button loading>{k("saving")}</Button>
          <Button disabled>{k("saveChanges")}</Button>
          <Button size="sm" variant="secondary">
            {k("edit")}
          </Button>
          <Button size="lg">{k("saveChanges")}</Button>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={k("fields")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={k("fullName")} htmlFor="kit-name" hint={k("fullNameHint")}>
            <Input id="kit-name" defaultValue={k("sampleName1")} />
          </Field>
          <Field label={k("iban")} htmlFor="kit-iban" error={k("ibanError")}>
            <Input id="kit-iban" dir="ltr" defaultValue="SA03 8000 0000" aria-invalid />
          </Field>
          <Field label={k("department")} htmlFor="kit-dept">
            <Select>
              <SelectTrigger id="kit-dept">
                <SelectValue placeholder={k("chooseDepartment")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finance">{k("finance")}</SelectItem>
                <SelectItem value="hr">{k("hr")}</SelectItem>
                <SelectItem value="ops">{k("operations")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={k("branch")} htmlFor="kit-branch">
            <NativeSelect id="kit-branch" defaultValue="dammam">
              <option value="riyadh">{k("riyadh")}</option>
              <option value="dammam">{k("dammam")}</option>
            </NativeSelect>
          </Field>
          <div className="md:col-span-2">
            <Field label={k("notes")} htmlFor="kit-notes">
              <Textarea id="kit-notes" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={k("badges")} />
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{k("active")}</Badge>
          <Badge tone="warning">{k("pending")}</Badge>
          <Badge tone="danger">{k("rejected")}</Badge>
          <Badge tone="info">{k("invited")}</Badge>
          <Badge tone="neutral">{k("inactive")}</Badge>
          <Badge tone="warning" dot>
            {k("expiringSoon")}
          </Badge>
          <Badge tone="danger" dot>
            {k("expired")}
          </Badge>
        </div>
      </Panel>

      <section className="space-y-3">
        <h2 className="text-section">{k("table")}</h2>
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{k("employee")}</TableHead>
              <TableHead>{k("employeeNo")}</TableHead>
              <TableHead>{k("status")}</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">{k("actions")}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.no}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <bdi>{row.no}</bdi>
                </TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={k("rowActions")}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>{k("view")}</DropdownMenuItem>
                      <DropdownMenuItem>{k("edit")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive>{k("deactivate")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <Panel>
        <PanelHeader title={k("tabs")} />
        <Tabs defaultValue="job">
          <TabsList>
            <TabsTrigger value="job">{k("tabJob")}</TabsTrigger>
            <TabsTrigger value="salary">{k("tabSalary")}</TabsTrigger>
            <TabsTrigger value="documents">{k("tabDocuments")}</TabsTrigger>
            <TabsTrigger value="history">{k("tabHistory")}</TabsTrigger>
          </TabsList>
          <TabsContent value="job">{k("tabJobBody")}</TabsContent>
          <TabsContent value="salary" className="tabular-nums">
            {k("tabSalaryBody")}
          </TabsContent>
          <TabsContent value="documents">{k("tabDocumentsBody")}</TabsContent>
          <TabsContent value="history" className="tabular-nums">
            {k("tabHistoryBody")}
          </TabsContent>
        </Tabs>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader title={k("dialog")} />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" icon={<Trash2 />}>
                {k("openDialog")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{k("dialogTitle")}</DialogTitle>
                <DialogDescription>{k("dialogBody")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{k("cancel")}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="danger">{k("deleteDocument")}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Panel>

        <Panel>
          <PanelHeader title={k("toast")} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast.success(k("toastSaved"))}>
              {k("showSuccess")}
            </Button>
            <Button variant="secondary" onClick={() => toast.error(k("toastFailed"))}>
              {k("showError")}
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={k("tooltip")} />
          <div className="flex flex-wrap gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary">{k("tooltipTrigger")}</Button>
              </TooltipTrigger>
              <TooltipContent>{k("tooltipBody")}</TooltipContent>
            </Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">{k("openPopover")}</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="text-dense text-ink-muted">{k("popoverBody")}</p>
              </PopoverContent>
            </Popover>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={k("skeleton")} />
          <div className="space-y-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
