interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * Логотип Parallel: две параллельные полосы прокрутки складываются в букву P —
 * сплошная ножка и полая дорожка, бегунок которой образует петлю. Два текста,
 * прокручиваемых рядом, — это и есть то, что делает продукт. Декоративный элемент:
 * смысл несёт название рядом с ним.
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
      <rect x="9" y="6" width="5.5" height="20" rx="2.75" fill="#CADCEA" />
      <rect x="17.9" y="6.4" width="4.7" height="11.6" rx="2.35" fill="none" stroke="#8FB1C9" strokeWidth="1.3" />
      <rect x="19.1" y="8.2" width="2.3" height="4.6" rx="1.15" fill="#8FB1C9" />
    </svg>
  )
}
