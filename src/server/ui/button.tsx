import type { Child, JSX } from "hono/jsx";

type ButtonProps = JSX.IntrinsicElements["button"] & {
  variant: "primary" | "secondary";
  children: Child;
};

export function Button({ variant, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} class={`button button-${variant}`}>
      {children}
    </button>
  );
}
