import React from 'react';
import { cn } from '@/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default:
    'bg-slate-900 text-white hover:bg-slate-800 border border-slate-900/10 shadow-[0_1px_2px_rgba(15,23,42,0.12)]',
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-700/10 shadow-[0_1px_3px_rgba(79,70,229,0.22)]',
  secondary:
    'bg-slate-900/[0.05] text-slate-900 hover:bg-slate-900/[0.09] border border-transparent',
  outline:
    'bg-white/80 text-slate-800 border border-slate-900/12 hover:bg-white hover:border-slate-900/20 shadow-[0_1px_2px_rgba(15,23,42,0.03)]',
  ghost:
    'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-900/[0.05] border border-transparent',
  destructive:
    'bg-rose-600 text-white hover:bg-rose-700 border border-transparent',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl h-8',
  md: 'px-4 py-2 text-sm rounded-xl h-9',
  lg: 'px-5 py-2.5 text-sm rounded-xl h-11',
};

export function Button({
  variant = 'default',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.99]',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading && (
        <svg
          className="h-3.5 w-3.5 animate-spin shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
