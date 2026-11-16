import { Button } from "./button.js";
import { useI18n } from "./i18n.js";

interface CopyButtonProps {
  target: string;
  label: string;
}

export function CopyButton({ target, label }: CopyButtonProps) {
  const { phrase } = useI18n();
  return (
    <Button
      variant="secondary"
      data-copy={target}
      data-label={label}
      data-copied-label={phrase("copied")}
    >
      {label}
    </Button>
  );
}
