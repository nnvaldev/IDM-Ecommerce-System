import { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 7h14l-1 13H6L5 7z" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      </div>
      <h3 className="text-base font-medium text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
