import { zodResolver } from "@hookform/resolvers/zod";
import { normalizeLoginIdentifier, PasswordResetRequestSchema, type PasswordResetRequest } from "@idara-pro/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/field";
import { ApiError, requestPasswordReset } from "@/lib/api";
import { AuthLayout } from "../auth-layout";

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
      await requestPasswordReset(normalizeLoginIdentifier(values.identifier));
      // Same message whether or not there is such an account.
      setState("sent");
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? "limited" : "error");
    }
  }

  if (state === "sent") {
    return (
      <AuthLayout title={t("auth.forgot.sentTitle")} intro={t("auth.forgot.sentBody")}>
        <BackToLogin />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.forgot.title")} intro={t("auth.forgot.intro")}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label={t("auth.login.identifier")} htmlFor="identifier" error={errors.identifier ? t("auth.login.identifierRequired") : undefined}>
          <Input id="identifier" dir="ltr" inputMode="numeric" autoComplete="username" autoCapitalize="none" spellCheck={false} {...register("identifier")} />
        </Field>
        {(state === "limited" || state === "error") && (
          <Alert>{state === "limited" ? t("auth.forgot.limited") : t("auth.login.serverError")}</Alert>
        )}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {t("auth.forgot.submit")}
        </Button>
        <BackToLogin />
      </form>
    </AuthLayout>
  );
}

function BackToLogin(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Link to="/login" className="block text-center text-dense text-primary underline-offset-2 hover:underline">
      {t("auth.backToLogin")}
    </Link>
  );
}
