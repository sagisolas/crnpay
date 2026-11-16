import type { Child } from "hono/jsx";

interface BannerProps {
  tone: "error" | "caution";
  id?: string;
  hidden?: boolean;
  children?: Child;
}

export function Banner({ tone, id, hidden = false, children }: BannerProps) {
  return (
    <div
      class={`banner banner-${tone}`}
      id={id}
      role={tone === "error" ? "alert" : undefined}
      hidden={hidden}
    >
      {children}
    </div>
  );
}
