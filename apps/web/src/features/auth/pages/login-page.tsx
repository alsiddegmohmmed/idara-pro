import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequestSchema, type LoginRequest } from "@idara-pro/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
      <h1 className="text-xl font-semibold">{t("auth.login.title")}</h1>
      {justReset && (
        <p role="status" className="rounded-md border border-primary px-3 py-2 text-sm text-primary">
          {t("auth.resetPassword.done")}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t("auth.login.email")}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{t("auth.login.invalidEmail")}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          {t("auth.login.password")}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{t("auth.login.passwordRequired")}</p>}
      </div>

      {formError && (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t("common.loading") : t("auth.login.submit")}
      </Button>
      <Link to="/forgot-password" className="block text-center text-sm text-primary underline">
        {t("auth.login.forgot")}
      </Link>
    </form>
  );
}
