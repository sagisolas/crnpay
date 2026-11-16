import { Button } from "./button.js";

interface CopyButtonProps {
  target: string;
  label: string;
  copiedLabel: string;
}

export function CopyButton({ target, label, copiedLabel }: CopyButtonProps) {
  return (
    <Button
      variant="secondary"
      data-copy={target}
      data-label={label}
      data-copied-label={copiedLabel}
    >
      {label}
    </Button>
  );
}
