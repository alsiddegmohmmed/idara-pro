import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequestSchema, normalizeLoginIdentifier, type LoginRequest } from "@idara-pro/shared";
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
import { DemoAccounts } from "../demo-accounts";

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
  const [picked, setPicked] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ mode: "onTouched", resolver: zodResolver(LoginRequestSchema) });

  if (status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  async function onSubmit(values: LoginRequest): Promise<void> {
    setFormError(null);
    try {
      await login(normalizeLoginIdentifier(values.identifier), values.password);
      navigate(next, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setFormError(t("auth.login.wrongCredentials"));
      else if (error instanceof ApiError && error.code === "auth.locked") {
        const minutes = Math.max(1, Math.ceil(Number(error.details.retryAfterSeconds ?? 900) / 60));
        setFormError(t("auth.login.locked", { minutes }));
      } else if (error instanceof ApiError && error.status === 429) setFormError(t("auth.login.tooMany"));
      else setFormError(t("auth.login.serverError"));
    }
  }

  return (
    <AuthLayout title={t("auth.login.welcome")} intro={t("auth.login.intro")}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {justReset && <Alert tone="success">{t("auth.resetPassword.done")}</Alert>}
        <Field
          label={t("auth.login.identifier")}
          htmlFor="identifier"
          hint={t("auth.login.identifierHint")}
          error={errors.identifier && t("auth.login.identifierRequired")}
        >
          <Input id="identifier" dir="ltr" inputMode="numeric" autoComplete="username" autoCapitalize="none" spellCheck={false} {...register("identifier")} />
        </Field>
        <div>
          <Field label={t("auth.login.password")} htmlFor="password" error={errors.password && t("auth.login.passwordRequired")}>
            <PasswordInput id="password" autoComplete="current-password" {...register("password")} />
          </Field>
          <Link to="/forgot-password" className="mt-2 inline-block text-dense text-primary underline-offset-4 hover:underline">
            {t("auth.login.forgot")}
          </Link>
        </div>
        {formError && <Alert>{formError}</Alert>}
        <Button type="submit" loading={isSubmitting && picked === null} disabled={picked !== null} className="h-11 w-full">
          {t("auth.login.submit")}
        </Button>
      </form>
      <DemoAccounts
        pending={picked}
        onPick={(a) => {
          // A test account signs in straight away; its credentials stay visible in the form.
          setValue("identifier", a.identifier, { shouldValidate: true });
          setValue("password", a.password, { shouldValidate: true });
          setPicked(a.identifier);
          void handleSubmit(onSubmit)().finally(() => setPicked(null));
        }}
      />
    </AuthLayout>
  );
}
