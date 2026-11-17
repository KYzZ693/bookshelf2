import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15'

export function FieldWrapper({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold tracking-wide text-muted uppercase">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  wrapperClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, hint, error, leftIcon, rightSlot, className, wrapperClassName, id, required, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fid} required={required} className={wrapperClassName}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">{leftIcon}</span>
        )}
        <input
          ref={ref}
          id={fid}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(inputClass, !!leftIcon && 'pl-9', !!rightSlot && 'pr-10', className)}
          {...rest}
        />
        {rightSlot && <span className="absolute top-1/2 right-2 -translate-y-1/2">{rightSlot}</span>}
      </div>
    </FieldWrapper>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  wrapperClassName?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextArea(
  { label, hint, error, className, wrapperClassName, id, required, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fid} required={required} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(inputClass, 'min-h-24 resize-y leading-relaxed', className)}
        {...rest}
      />
    </FieldWrapper>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  wrapperClassName?: string
}

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, hint, error, className, wrapperClassName, id, required, children, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fid} required={required} className={wrapperClassName}>
      <select
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(inputClass, 'appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237A7368' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  )
})
