import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function Countdown({ expiresAt }: { expiresAt: string }) {
  const { t } = useTranslation()
  const end = Date.parse(expiresAt)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!Number.isFinite(end)) return

    function tick() {
      const current = Date.now()
      setNow(current)
      if (current >= end) window.clearInterval(interval)
    }

    const interval = window.setInterval(tick, 250)
    const initial = window.setTimeout(tick, 0)
    document.addEventListener('visibilitychange', tick)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(initial)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [end])

  const seconds = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0
  const minutes = Math.floor(seconds / 60)
  const remaining = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="type-label text-ink tabular-nums" data-slot="countdown">
      <p role="status">{seconds === 0 && t('countdown.expired')}</p>
      {seconds > 0 && <p role="timer">{t('countdown.remaining', { remaining })}</p>}
    </div>
  )
}
