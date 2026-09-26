import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequestSchema, type LoginRequest } from "@idara-pro/shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function LoginPage(): React.JSX.Element {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema) });

  function onSubmit(_values: LoginRequest): void {
    // Wired up to POST /api/v1/auth/login once auth lands (Stage 4).
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{t("auth.login.title")}</h1>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t("auth.login.email")}
        </label>
        <input
          id="email"
          type="email"
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
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{t("auth.login.passwordRequired")}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("auth.login.submit")}
      </Button>
    </form>
  );
}
