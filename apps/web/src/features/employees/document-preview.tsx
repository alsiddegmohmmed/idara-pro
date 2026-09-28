import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFileBlob } from "./documents";

/**
 * Side panel on the inline-end showing a PDF or image before a decision (ui-spec §7.5).
 * `path` null = closed.
 */
export function DocumentPreview({
  path,
  title,
  onClose,
  footer,
}: {
  path: string | null;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [file, setFile] = useState<{ url: string; type: string } | null | "error">(null);

  useEffect(() => {
    if (!path) return;
    let url: string | null = null;
    let cancelled = false;
    setFile(null);
    void fetchFileBlob(path).then((blob) => {
      if (cancelled) return;
      if (!blob) return setFile("error");
      url = URL.createObjectURL(blob);
      setFile({ url, type: blob.type });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  return (
    <DialogPrimitive.Root open={path !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[640px] flex-col border-s border-line bg-surface shadow-float data-[state=open]:animate-fade-in"
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
            <DialogPrimitive.Title className="truncate text-subsection text-ink">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-control p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">{t("common.close")}</span>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4">
            {file === null && <Skeleton className="h-full min-h-96" />}
            {file === "error" && <p role="alert" className="text-danger">{t("documents.previewFailed")}</p>}
            {file !== null && file !== "error" &&
              (file.type.startsWith("image/") ? (
                <img src={file.url} alt={title} className="mx-auto max-w-full rounded-control border border-line bg-surface" />
              ) : (
                <iframe src={file.url} title={title} className="h-full min-h-[70vh] w-full rounded-control border border-line bg-surface" />
              ))}
          </div>
          {footer && <div className="shrink-0 border-t border-line px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
