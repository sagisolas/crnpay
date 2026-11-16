import type { Child } from "hono/jsx";

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  counter?: boolean;
  children: Child;
}

export function Field({ id, label, hint, counter = false, children }: FieldProps) {
  return (
    <div class="field">
      <label class="label" for={id}>
        {label}
      </label>
      {children}
      <div class="hint">
        <span id={`${id}-hint`}>{hint}</span>
        {counter && <span class="count" id={`${id}-count`} />}
      </div>
      <div class="error" id={`${id}-error`} />
    </div>
  );
}
