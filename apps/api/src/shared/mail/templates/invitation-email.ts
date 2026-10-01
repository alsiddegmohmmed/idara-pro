import { renderBilingual } from "./layout";

export function renderInvitationEmail(input: { acceptUrl: string; employeeName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  return renderBilingual({
    subject: "دعوة للانضمام إلى إدارة برو | Invitation to Idara Pro",
    arTitle: `مرحباً ${input.employeeName}`,
    arBody: "تمت دعوتك لإنشاء حسابك على منصة إدارة برو. اضغط على الزر أدناه لتعيين كلمة المرور، ثم سجّل الدخول برقم هويتك أو إقامتك.",
    arButton: "تعيين كلمة المرور",
    arFooter: "الرابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة فقط. إذا لم تكن تتوقع هذه الرسالة فتجاهلها.",
    enTitle: `Hello ${input.employeeName}`,
    enBody: "You have been invited to create your account on Idara Pro. Use the button below to set your password, then sign in with your national ID or iqama number.",
    enButton: "Set your password",
    enFooter: "This link is valid for 72 hours and can be used once. If you weren't expecting this email, ignore it.",
    url: input.acceptUrl,
  });
}
