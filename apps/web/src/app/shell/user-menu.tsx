import { ChevronDown, Languages, LogOut, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setLanguage } from "@/i18n";

/** Avatar + name → ملفي، English/العربية، تسجيل الخروج (ui-spec §6.1). */
export function UserMenu({
  name,
  showProfile,
  onLogout,
}: {
  name: string;
  showProfile: boolean;
  onLogout: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("shell.userMenu")}
        className="flex h-12 items-center gap-2 rounded-control px-1.5 text-body text-ink hover:bg-canvas"
      >
        <Avatar name={name} />
        <span className="hidden max-w-40 truncate font-medium sm:inline">{name}</span>
        <ChevronDown className="hidden size-4 text-ink-muted sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {showProfile && (
          <DropdownMenuItem onSelect={() => navigate("/profile")}>
            <UserRound aria-hidden="true" />
            {t("nav.myProfile")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setLanguage(i18n.language === "ar" ? "en" : "ar")}>
          <Languages aria-hidden="true" />
          {/* Each language names itself, so it is readable before switching. */}
          <span lang={i18n.language === "ar" ? "en" : "ar"}>{t("shell.language")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="rtl:-scale-x-100" aria-hidden="true" />
          {t("home.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
