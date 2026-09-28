import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequestSchema, type LoginRequest } from "@idara-pro/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import { useAuth } from "../auth-context";
import { AuthLayout } from "../auth-layout";

export function LoginPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justReset = params.get("reset") === "1";
  const rawNext = params.get("next");
  // Only same-site paths: "/x" yes, "//evil.com" or "https://…" no (open-redirect guard).
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema) });

  if (status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  async function onSubmit(values: LoginRequest): Promise<void> {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401 ? t("auth.login.wrongCredentials") : t("auth.login.serverError"),
      );
    }
  }

  return (
    <AuthLayout title={t("auth.login.title")}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {justReset && <Alert tone="success">{t("auth.resetPassword.done")}</Alert>}
        <Field label={t("auth.login.email")} htmlFor="email" error={errors.email && t("auth.login.invalidEmail")}>
          <Input id="email" type="email" dir="ltr" autoComplete="username" {...register("email")} />
        </Field>
        <Field label={t("auth.login.password")} htmlFor="password" error={errors.password && t("auth.login.passwordRequired")}>
          <PasswordInput id="password" autoComplete="current-password" {...register("password")} />
        </Field>
        {formError && <Alert>{formError}</Alert>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {t("auth.login.submit")}
        </Button>
        <Link to="/forgot-password" className="block text-center text-dense text-primary underline-offset-2 hover:underline">
          {t("auth.login.forgot")}
        </Link>
      </form>
    </AuthLayout>
  );
}
