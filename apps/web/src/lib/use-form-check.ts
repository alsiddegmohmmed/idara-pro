import { useCallback, useState } from "react";

/**
 * The one way forms check input (ui-spec §8): a field's error shows once you leave it or press save — never
 * while you are still typing — and a failed save moves focus to the first invalid field. Pair with <Field>,
 * which marks its control aria-invalid when it has an error.
 */
export function useFormCheck(): {
  /** Should this field (its id / Field htmlFor) show its error now? */
  show: (id: string) => boolean;
  /** Has a save been attempted? */
  submitted: boolean;
  /** Put on the <form>: remembers which fields were left. */
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  /** Call on save: returns `valid`; when invalid, focuses the first invalid field. */
  submit: (valid: boolean) => boolean;
  reset: () => void;
} {
  const [submitted, setSubmitted] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const onBlur = useCallback((e: React.FocusEvent<HTMLElement>) => {
    const id = (e.target as HTMLElement).id;
    if (id) setLeft((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);
  const submit = useCallback((valid: boolean) => {
    setSubmitted(true);
    if (!valid) {
      // After the errors render: the open dialog first, else the page.
      setTimeout(() => {
        const scope = document.querySelector('[role="dialog"]') ?? document;
        scope.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
    }
    return valid;
  }, []);
  return {
    show: (id) => submitted || left.has(id),
    submitted,
    onBlur,
    submit,
    reset: () => {
      setSubmitted(false);
      setLeft(new Set());
    },
  };
}
