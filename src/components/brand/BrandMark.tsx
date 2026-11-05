interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * Parallel logo: two parallel strokes — the original and its translation
 * side by side. Decorative; the brand name next to it carries the meaning.
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#1E3A52" />
      <path d="M8.5 24.5h4.6l6.4-17h-4.6z" fill="#CADCEA" />
      <path d="M15.5 24.5h4.6l6.4-17h-4.6z" fill="#8FB1C9" />
    </svg>
  )
}
