import { renderBilingual } from "./layout";

export function renderPasswordResetEmail(input: { resetUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  return renderBilingual({
    subject: "إعادة تعيين كلمة المرور | Password reset",
    arTitle: "إعادة تعيين كلمة المرور",
    arBody: "تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.",
    arButton: "اختيار كلمة مرور جديدة",
    arFooter: "الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك فتجاهل هذه الرسالة.",
    enTitle: "Password reset",
    enBody: "We received a request to reset your account password. Use the button below to choose a new one.",
    enButton: "Choose a new password",
    enFooter: "This link is valid for 1 hour. If you didn't request this, ignore this email.",
    url: input.resetUrl,
  });
}
