import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "../auth-context";
import { SetPasswordForm } from "../set-password-form";

export function AcceptInvitationPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { acceptInvitation } = useAuth();
  const token = useSearchParams()[0].get("token");

  if (!token) {
    return <LinkProblem message={t("auth.acceptInvitation.missingToken")} />;
  }

  async function submit(password: string): Promise<void> {
    try {
      await acceptInvitation(token as string, password);
    } catch (error) {
      throw new Error(
        error instanceof ApiError && error.status === 401
          ? t("auth.acceptInvitation.expired")
          : error instanceof ApiError && error.code === "auth.invitation.email_in_use"
            ? t("auth.acceptInvitation.emailInUse")
            : t("auth.setPassword.failed"),
      );
    }
    navigate("/profile", { replace: true });
  }

  return (
    <SetPasswordForm
      title={t("auth.acceptInvitation.title")}
      intro={t("auth.acceptInvitation.intro")}
      submitLabel={t("auth.acceptInvitation.submit")}
      onSubmit={submit}
    />
  );
}

export function LinkProblem({ message }: { message: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-sm space-y-3">
      <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        {message}
      </p>
      <Link to="/login" className="text-sm text-primary underline">
        {t("auth.backToLogin")}
      </Link>
    </div>
  );
}
