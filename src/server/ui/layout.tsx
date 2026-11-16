import type { Child } from "hono/jsx";

interface LayoutProps {
  title: string;
  lang: string;
  stylesheet: string;
  script: string;
  children: Child;
}

export function Layout({ title, lang, stylesheet, script, children }: LayoutProps) {
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href={stylesheet} />
        <script type="module" src={script} />
      </head>
      <body>{children}</body>
    </html>
  );
}
