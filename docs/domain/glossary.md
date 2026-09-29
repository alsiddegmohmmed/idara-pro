# Glossary (Arabic ↔ English ↔ code)

| Arabic | English | Code name |
|---|---|---|
| الموظف | Employee | `employee` |
| الفرع | Branch / site | `branch` |
| القسم | Department | `department` |
| الحضور والانصراف | Attendance (check-in / check-out) | `attendance` |
| تسجيل حضور / انصراف | Punch (in / out) | `attendance_punch` (`kind: in|out`) |
| نطاق الحضور | Attendance radius | `radius_m` |
| سماحية التأخير | Late grace period | `late_grace_min` |
| الإجازة | Leave | `leave_request` |
| رصيد الإجازات | Leave balance | `leave_balance` |
| العهدة | Custody (cash advanced to an employee for work) | `custody_request` |
| تسوية العهدة | Custody settlement | `settled` |
| مسير الرواتب | Payroll run | `payroll_run` |
| قسيمة الراتب | Payslip | `payslip` |
| الراتب الأساسي | Basic salary | `salary_component.type = basic` |
| بدل سكن / نقل | Housing / transport allowance | `housing` / `transport` |
| الخصومات | Deductions | `deductions` |
| التأمينات الاجتماعية | GOSI (social insurance) | `gosi` |
| الإقامة | Iqama (residence permit) | `iqama` |
| رقم الهوية | National ID | `national_id` |
| هللة | Halala (1/100 SAR) — money unit in DB | `*_halalas` |
| تقنية لينك | Techno Link (accounting system) | `techno_link` |
| المدير / المشرف | Manager | role `manager` |
| الموارد البشرية | HR | role `hr` |
| المحاسب | Accountant | role `accountant` |
| الإنذار | Warning (disciplinary) | `warning` |
| الاستئذان | Short permission (part of a day off) | `shortleave_request` |
| العقد | Employment contract | `contract` |
| فترة التجربة | Probation period | `probation_end` |
| التأمين الطبي | Medical insurance | `insurance_policy` / `employee_insurance` |
| جهة اتصال / شخص موثوق | Relative or trusted contact | `employee_contact` |
| الخصم / الاستقطاع | Deduction (pay adjustment) | `payroll_adjustment` (`kind: deduction`) |
| المكافأة / البدل الإضافي | Bonus / extra allowance | `payroll_adjustment` (`kind: bonus|allowance`) |
| التنبيه | Alert (rule-based reminder) | `alert_rule` |
| كبار المديرين | Executives (see all branches) | role `executive` |
| مدير الفرع | Branch manager | role `branch_manager` |
| نطاق الصلاحية | Reach of a permission (own / team / branch / company) | `scope` |
| الدور | Role (a set of permissions) | `role` |
| إسناد الدور | Role assignment (who, which role, which branches) | `role_assignment` |
| النقل بين الفروع | Transfer between branches | `employee_assignment` |

