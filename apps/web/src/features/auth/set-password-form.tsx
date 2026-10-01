import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { NewPasswordSchema } from "@idara-pro/shared";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthLayout } from "./auth-layout";

/** Same rule the API enforces (NewPasswordSchema) plus a confirmation the API doesn't need. */
const schema = z
  .object({ password: NewPasswordSchema, confirm: z.string() })
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
    <AuthLayout title={title} intro={intro}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field
          label={t("auth.setPassword.password")}
          htmlFor="password"
          hint={t("auth.setPassword.rule")}
          error={
            errors.password ? (errors.password.message === "password_digits_only" ? t("auth.setPassword.digitsOnly") : t("auth.setPassword.tooShort")) : undefined
          }
        >
          <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field
          label={t("auth.setPassword.confirm")}
          htmlFor="confirm"
          error={errors.confirm ? t("auth.setPassword.mismatch") : undefined}
        >
          <PasswordInput id="confirm" autoComplete="new-password" {...register("confirm")} />
        </Field>
        {formError && <Alert>{formError}</Alert>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {submitLabel}
        </Button>
      </form>
    </AuthLayout>
  );
}
