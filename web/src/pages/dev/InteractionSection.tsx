import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { WorkspaceNavigation } from '@/app/layouts/WorkspaceLayout'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'

export default function InteractionSection() {
  const { t } = useTranslation()

  return (
    <>
      <section className="space-y-4" aria-labelledby="interaction-title">
        <h2 id="interaction-title" className="type-card-title">
          {t('dev.interactions.title')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.success(t('dev.interactions.saved'))}
          >
            {t('dev.interactions.success')}
          </Button>
          <Button type="button" variant="outline" onClick={() => toast.info(t('time.astanaZone'))}>
            {t('dev.interactions.info')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.warning(t('dev.feedback.warning'))}
          >
            {t('dev.interactions.warning')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.error(t('errors.NETWORK_ERROR'))}
          >
            {t('dev.interactions.error')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline">
                {t('dev.interactions.applyFilter')}
              </Button>
            }
            title={t('dev.interactions.filterTitle')}
            description={t('dev.interactions.filterDescription')}
            confirmLabel={t('dev.interactions.apply')}
            onConfirm={() => toast.success(t('dev.interactions.saved'))}
          />
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive">
                {t('dev.buttons.confirmRefund')}
              </Button>
            }
            title={t('dev.interactions.refundTitle')}
            description={t('dev.interactions.refundDescription')}
            confirmLabel={t('dev.buttons.confirmRefund')}
            destructive
            onConfirm={() => toast.success(t('dev.interactions.refunded'))}
          />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="layout-previews-title">
        <h2 id="layout-previews-title" className="type-card-title">
          {t('dev.interactions.layouts')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/">{t('nav.public')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/organizer">{t('nav.organizer')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin">{t('nav.admin')}</Link>
          </Button>
        </div>
        <div className="max-w-sm rounded-md bg-sidebar">
          <WorkspaceNavigation area="organizer" supportCount={3} />
        </div>
      </section>
    </>
  )
}
