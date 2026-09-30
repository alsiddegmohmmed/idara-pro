import { renderBilingual } from "./layout";

type Params = Record<string, string | number | null>;

interface Copy {
  subject: string;
  arTitle: string;
  enTitle: string;
  arBody: (p: Params) => string;
  enBody: (p: Params) => string;
}

const sar = (halalas: unknown): string =>
  typeof halalas === "string" && /^\d+$/.test(halalas)
    ? (Number(halalas) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
const range = (p: Params): string => `${p.startDate ?? ""} → ${p.endDate ?? ""}`;
const note = (p: Params, ar: boolean): string => (p.note ? (ar ? ` السبب: ${p.note}` : ` Reason: ${p.note}`) : "");

/** Email copy per notification type (in-app text lives in the web app's i18n files). */
const COPY: Record<string, Copy> = {
  contract_end_soon: {
    subject: "عقد ينتهي قريبًا | Contract ending soon",
    arTitle: "عقد ينتهي قريبًا",
    enTitle: "Contract ending soon",
    arBody: (p) => `ينتهي عقد ${p.employeeNameAr} بتاريخ ${p.date}.`,
    enBody: (p) => `${p.employeeNameEn} contract ends on ${p.date}.`,
  },
  contract_end_passed: {
    subject: "انتهى عقد | Contract end date passed",
    arTitle: "انتهى تاريخ العقد",
    enTitle: "Contract end date passed",
    arBody: (p) => `انتهى عقد ${p.employeeNameAr} بتاريخ ${p.date} ولم يُجدَّد أو يُنهَ في النظام.`,
    enBody: (p) => `${p.employeeNameEn}'s contract ended on ${p.date} and hasn't been renewed or closed in the system.`,
  },
  probation_end_soon: {
    subject: "نهاية فترة التجربة | Probation ending",
    arTitle: "فترة التجربة تنتهي قريبًا",
    enTitle: "Probation ending soon",
    arBody: (p) => `تنتهي فترة تجربة ${p.employeeNameAr} بتاريخ ${p.date}. قرّر التثبيت قبلها.`,
    enBody: (p) => `${p.employeeNameEn}'s probation ends on ${p.date}. Decide on confirmation before then.`,
  },
  probation_end_passed: {
    subject: "انتهت فترة التجربة | Probation ended",
    arTitle: "انتهت فترة التجربة",
    enTitle: "Probation ended",
    arBody: (p) => `انتهت فترة تجربة ${p.employeeNameAr} بتاريخ ${p.date}.`,
    enBody: (p) => `${p.employeeNameEn}'s probation ended on ${p.date}.`,
  },
  insurance_end_soon: {
    subject: "تأمين ينتهي قريبًا | Insurance ending soon",
    arTitle: "تأمين طبي ينتهي قريبًا",
    enTitle: "Medical insurance ending soon",
    arBody: (p) => `ينتهي التأمين الطبي لـ${p.employeeNameAr} بتاريخ ${p.date}.`,
    enBody: (p) => `${p.employeeNameEn}'s medical insurance ends on ${p.date}.`,
  },
  insurance_end_passed: {
    subject: "انتهى التأمين | Insurance ended",
    arTitle: "انتهى التأمين الطبي",
    enTitle: "Medical insurance ended",
    arBody: (p) => `انتهى التأمين الطبي لـ${p.employeeNameAr} بتاريخ ${p.date}.`,
    enBody: (p) => `${p.employeeNameEn}'s medical insurance ended on ${p.date}.`,
  },
  leave_requested: {
    subject: "طلب إجازة بانتظار قرارك | Leave request awaiting your decision",
    arTitle: "طلب إجازة جديد",
    enTitle: "New leave request",
    arBody: (p) => `${p.employeeNameAr} طلب ${p.leaveTypeAr} من ${range(p)} (${p.days} يوم عمل).`,
    enBody: (p) => `${p.employeeNameEn} requested ${p.leaveTypeEn}, ${range(p)} (${p.days} working days).`,
  },
  leave_approved: {
    subject: "تمت الموافقة على إجازتك | Your leave was approved",
    arTitle: "تمت الموافقة على إجازتك",
    enTitle: "Your leave was approved",
    arBody: (p) => `تمت الموافقة على ${p.leaveTypeAr} من ${range(p)}.`,
    enBody: (p) => `Your ${p.leaveTypeEn}, ${range(p)}, was approved.`,
  },
  leave_rejected: {
    subject: "تم رفض طلب إجازتك | Your leave request was rejected",
    arTitle: "تم رفض طلب إجازتك",
    enTitle: "Your leave request was rejected",
    arBody: (p) => `تم رفض ${p.leaveTypeAr} من ${range(p)}.${note(p, true)}`,
    enBody: (p) => `Your ${p.leaveTypeEn}, ${range(p)}, was rejected.${note(p, false)}`,
  },
  custody_requested: {
    subject: "طلب عهدة بانتظار قرارك | Custody request awaiting your decision",
    arTitle: "طلب عهدة جديد",
    enTitle: "New custody request",
    arBody: (p) => `${p.employeeNameAr} طلب عهدة بمبلغ ${sar(p.amountHalalas)} ر.س: ${p.purpose}`,
    enBody: (p) => `${p.employeeNameEn} requested custody of SAR ${sar(p.amountHalalas)}: ${p.purpose}`,
  },
  custody_approved: {
    subject: "تمت الموافقة على عهدتك | Your custody request was approved",
    arTitle: "تمت الموافقة على طلب العهدة",
    enTitle: "Your custody request was approved",
    arBody: (p) => `تمت الموافقة على عهدة بمبلغ ${sar(p.amountHalalas)} ر.س. سيتم صرفها من المحاسبة.`,
    enBody: (p) => `Your custody of SAR ${sar(p.amountHalalas)} was approved. Accounting will pay it out.`,
  },
  custody_rejected: {
    subject: "تم رفض طلب العهدة | Your custody request was rejected",
    arTitle: "تم رفض طلب العهدة",
    enTitle: "Your custody request was rejected",
    arBody: (p) => `تم رفض عهدة بمبلغ ${sar(p.amountHalalas)} ر.س.${note(p, true)}`,
    enBody: (p) => `Your custody request of SAR ${sar(p.amountHalalas)} was rejected.${note(p, false)}`,
  },
  custody_to_pay: {
    subject: "عهدة معتمدة بانتظار الصرف | Approved custody awaiting payment",
    arTitle: "عهدة بانتظار الصرف",
    enTitle: "Custody awaiting payment",
    arBody: (p) => `عهدة ${p.employeeNameAr} بمبلغ ${sar(p.amountHalalas)} ر.س معتمدة. اصرفها وسجّل مرجع تكنو لينك.`,
    enBody: (p) => `${p.employeeNameEn}'s custody of SAR ${sar(p.amountHalalas)} is approved. Pay it and record the Techno Link reference.`,
  },
  custody_paid: {
    subject: "تم صرف عهدتك | Your custody was paid",
    arTitle: "تم صرف العهدة",
    enTitle: "Your custody was paid",
    arBody: (p) => `تم صرف عهدة بمبلغ ${sar(p.amountHalalas)} ر.س.`,
    enBody: (p) => `Your custody of SAR ${sar(p.amountHalalas)} was paid.`,
  },
  custody_settled: {
    subject: "تمت تسوية عهدتك | Your custody was settled",
    arTitle: "تمت تسوية العهدة",
    enTitle: "Your custody was settled",
    arBody: (p) => `تمت تسوية عهدة بمبلغ ${sar(p.amountHalalas)} ر.س.`,
    enBody: (p) => `Your custody of SAR ${sar(p.amountHalalas)} was settled.`,
  },
  attendance_missing_checkout: {
    subject: "تسجيل خروج مفقود | Missing check-out",
    arTitle: "لم يُسجَّل الخروج",
    enTitle: "Missing check-out",
    arBody: (p) => `لم يُسجَّل خروج ${p.employeeNameAr} يوم ${p.workDate}. يمكن للمدير تصحيح اليوم.`,
    enBody: (p) => `No check-out was recorded for ${p.employeeNameEn} on ${p.workDate}. A manager can correct the day.`,
  },
};

export function hasNotificationEmail(type: string): boolean {
  return type in COPY;
}

export function renderNotificationEmail(type: string, params: Params, url: string): { subject: string; html: string; text: string } | null {
  const copy = COPY[type];
  if (!copy) return null;
  return renderBilingual({
    subject: copy.subject,
    arTitle: copy.arTitle,
    arBody: copy.arBody(params),
    arButton: "فتح إدارة برو",
    arFooter: "وصلتك هذه الرسالة لأنك معني بهذا الإجراء في إدارة برو.",
    enTitle: copy.enTitle,
    enBody: copy.enBody(params),
    enButton: "Open Idara Pro",
    enFooter: "You received this because this action involves you in Idara Pro.",
    url,
  });
}
