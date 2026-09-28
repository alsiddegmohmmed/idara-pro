import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Same rule the API enforces (min 8) plus a confirmation the API doesn't need. */
const schema = z
  .object({ password: z.string().min(8), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "mismatch" });
type Values = z.infer<typeof schema>;

export function SetPasswordForm({
  title,
  intro,
  submitLabel,
  onSubmit,
}: {
  title: string;
  intro: string;
  submitLabel: string;
  /** Throw to show the message in the form; resolve to finish. */
  onSubmit: (password: string) => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function submit(values: Values): Promise<void> {
    setFormError(null);
    try {
      await onSubmit(values.password);
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : t("auth.setPassword.failed"));
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-page-title">{title}</h1>
      <p className="text-dense text-ink-muted">{intro}</p>
      <Field
        label={t("auth.setPassword.password")}
        htmlFor="password"
        hint={t("auth.setPassword.rule")}
        error={errors.password ? t("auth.setPassword.tooShort") : undefined}
      >
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field
        label={t("auth.setPassword.confirm")}
        htmlFor="confirm"
        error={errors.confirm ? t("auth.setPassword.mismatch") : undefined}
      >
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      {formError && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-meta text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t("common.loading") : submitLabel}
      </Button>
    </form>
  );
}
