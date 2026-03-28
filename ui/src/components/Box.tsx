import type { ReactNode } from 'react';

interface BoxProps {
  children: ReactNode;
  className?: string;
  /** adds a 2px orange top-border accent line */
  accent?: boolean;
}

export function Box({ children, className = '', accent = false }: BoxProps) {
  return (
    <div
      className={`bg-[#121212] border border-[#1F1F1F] rounded-2xl ${className}`}
      style={accent ? { borderTop: '2px solid #FF6A00' } : undefined}
    >
      {children}
    </div>
  );
}

interface BoxHeaderProps {
  title: string;
  action?: ReactNode;
}

export function BoxHeader({ title, action }: BoxHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-mono text-[#888888] uppercase tracking-widest">{title}</span>
      {action}
    </div>
  );
}
