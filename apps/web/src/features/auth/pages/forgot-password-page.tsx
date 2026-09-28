import { zodResolver } from "@hookform/resolvers/zod";
import { PasswordResetRequestSchema, type PasswordResetRequest } from "@idara-pro/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError, requestPasswordReset } from "@/lib/api";

export function ForgotPasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "sent" | "limited" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequest>({ resolver: zodResolver(PasswordResetRequestSchema) });

  async function submit(values: PasswordResetRequest): Promise<void> {
    try {
      await requestPasswordReset(values.email);
      // Same message whether or not the address has an account.
      setState("sent");
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? "limited" : "error");
    }
  }

  if (state === "sent") {
    return (
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">{t("auth.forgot.sentTitle")}</h1>
        <p className="text-sm">{t("auth.forgot.sentBody")}</p>
        <Link to="/login" className="text-sm text-primary underline">
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{t("auth.forgot.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("auth.forgot.intro")}</p>
      <Field label={t("auth.login.email")} htmlFor="email" error={errors.email ? t("auth.login.invalidEmail") : undefined}>
        <Input id="email" type="email" autoComplete="username" {...register("email")} />
      </Field>
      {(state === "limited" || state === "error") && (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {state === "limited" ? t("auth.forgot.limited") : t("auth.login.serverError")}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t("common.loading") : t("auth.forgot.submit")}
      </Button>
      <Link to="/login" className="block text-center text-sm text-primary underline">
        {t("auth.backToLogin")}
      </Link>
    </form>
  );
}
