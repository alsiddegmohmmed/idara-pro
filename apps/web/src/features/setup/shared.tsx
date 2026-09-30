import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { ApiError } from "@/lib/api";

/** Server error code → message for the setup screens (in-use deletes, validation). */
export function setupError(t: (k: string) => string, e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code.endsWith(".in_use")) return t("setup.errors.inUse");
    if (e.status === 400) return t("setup.errors.invalid");
  }
  return t("setup.errors.failed");
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** One setup list: a table, an add button and per-row edit/delete when the user may manage. */
export function SetupTable<T extends { id: string }>({
  rows,
  loading,
  failed,
  columns,
  canManage,
  addLabel,
  onAdd,
  onEdit,
  onDelete,
}: {
  rows: T[] | undefined;
  loading: boolean;
  failed: boolean;
  columns: Column<T>[];
  canManage: boolean;
  addLabel: string;
  onAdd: () => void;
  onEdit: (row: T) => void;
  /** Omitted = rows can't be deleted (kept for history). */
  onDelete?: (row: T) => Promise<unknown>;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (loading) return <Skeleton className="h-48" />;
  if (failed) return <Alert>{t("common.loadFailed")}</Alert>;
  return (
    <div className="space-y-4">
      {canManage && (
        <div>
          <Button icon={<Plus />} onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      )}
      {!rows || rows.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState message={t("setup.empty")} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              {columns.map((c) => (
                <TableHead key={c.header} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
              {canManage && (
                <TableHead className="w-28">
                  <span className="sr-only">{t("setup.actions")}</span>
                </TableHead>
              )}
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => (
                  <TableCell key={c.header} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
                {canManage && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={t("common.edit")} onClick={() => onEdit(row)}>
                        <Pencil />
                      </Button>
                      {onDelete && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("common.delete")}
                        onClick={() => {
                          if (!window.confirm(t("setup.confirmDelete"))) return;
                          onDelete(row).then(
                            () => toast.success(t("setup.deleted")),
                            (e: unknown) => toast.error(setupError(t, e)),
                          );
                        }}
                      >
                        <Trash2 />
                      </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Dialog shell with a form id so the footer's submit button sits outside the scrolling body. */
export function FormDialog({
  title,
  formId,
  open,
  onClose,
  saving,
  canSave,
  error,
  onSubmit,
  children,
}: {
  title: string;
  formId: string;
  open: boolean;
  onClose: () => void;
  saving: boolean;
  canSave: boolean;
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("common.cancel")}</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={saving} disabled={!canSave}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
