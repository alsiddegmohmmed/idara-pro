import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequestSchema, type LoginRequest } from "@idara-pro/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { useAuth } from "../auth-context";

export function LoginPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const justReset = useSearchParams()[0].get("reset") === "1";
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema) });

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(values: LoginRequest): Promise<void> {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401 ? t("auth.login.wrongCredentials") : t("auth.login.serverError"),
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-page-title">{t("auth.login.title")}</h1>
      {justReset && (
        <p role="status" className="rounded-control bg-success-soft px-3 py-2 text-meta text-success">
          {t("auth.resetPassword.done")}
        </p>
      )}

      <Field label={t("auth.login.email")} htmlFor="email" error={errors.email && t("auth.login.invalidEmail")}>
        <Input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          {...register("email")}
        />
      </Field>

      <Field label={t("auth.login.password")} htmlFor="password" error={errors.password && t("auth.login.passwordRequired")}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>

      {formError && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-meta text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" loading={isSubmitting} className="w-full">
        {t("auth.login.submit")}
      </Button>
      <Link to="/forgot-password" className="block text-center text-dense text-primary underline">
        {t("auth.login.forgot")}
      </Link>
    </form>
  );
}
