import { useState } from 'react'
import styles from './UserAvatar.module.css'

interface UserAvatarProps { url: string | null; name: string; large?: boolean; alt?: string }
export function UserAvatar({ url, name, large = false, alt = '' }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <span className={large ? styles.large : styles.small}>
      {url && url !== failedUrl
        ? <img src={url} alt={alt} onError={() => setFailedUrl(url)} />
        : <span aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || '?'}</span>}
    </span>
  )
}
