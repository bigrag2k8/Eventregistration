"use client";

import { useFormStatus } from "react-dom";

interface Props {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Submit button that disables itself while its <form action> is pending.
 * Use on server-action forms whose action is slow or non-idempotent (e.g. the
 * campaign blast, which loops every recipient) so a double-click can't fire it
 * twice. Must be rendered inside the <form>.
 */
export function SubmitButton({ children, pendingText, className, disabled, title }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={className} aria-busy={pending} title={title}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
