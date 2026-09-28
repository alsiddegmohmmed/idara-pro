import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, confirmPasswordReset } from "@/lib/api";
import { SetPasswordForm } from "../set-password-form";
import { LinkProblem } from "./accept-invitation-page";

export function ResetPasswordPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useSearchParams()[0].get("token");

  if (!token) {
    return <LinkProblem message={t("auth.resetPassword.missingToken")} />;
  }

  async function submit(password: string): Promise<void> {
    try {
      await confirmPasswordReset(token as string, password);
    } catch (error) {
      throw new Error(
        error instanceof ApiError && error.status === 401 ? t("auth.resetPassword.expired") : t("auth.setPassword.failed"),
      );
    }
    navigate("/login?reset=1", { replace: true });
  }

  return (
    <SetPasswordForm
      title={t("auth.resetPassword.title")}
      intro={t("auth.resetPassword.intro")}
      submitLabel={t("auth.resetPassword.submit")}
      onSubmit={submit}
    />
  );
}
