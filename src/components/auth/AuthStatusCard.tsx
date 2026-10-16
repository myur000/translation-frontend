import type { ReactNode } from 'react'
import styles from './AuthStatusCard.module.css'

interface AuthStatusCardProps {
  tone: 'loading' | 'success' | 'error'
  title: string
  description: ReactNode
  children?: ReactNode
}

export function AuthStatusCard({
  tone,
  title,
  description,
  children,
}: AuthStatusCardProps) {
  const icon = tone === 'success' ? '✓' : tone === 'error' ? '!' : '…'

  return (
    <section
      className={`${styles.card} ${styles[tone]}`}
      aria-labelledby="auth-status-title"
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <h1 id="auth-status-title">{title}</h1>
      <div className={styles.description}>{description}</div>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </section>
  )
}
