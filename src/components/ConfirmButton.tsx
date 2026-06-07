"use client";

interface Props {
  label: string;
  confirmText: string;
  className?: string;
}

/**
 * Drop inside a <form action={serverAction}>. Pops a browser confirm()
 * before allowing submit. If user cancels, prevents submission.
 */
export function ConfirmButton({ label, confirmText, className = "" }: Props) {
  return (
    <button
      type="submit"
      className={className || "text-xs text-red-600 hover:underline"}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
