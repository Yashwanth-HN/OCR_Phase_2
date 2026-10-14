import { useI18n } from '@/i18n';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <span>{t('footer.left')}</span>
      <span>{t('footer.right')}</span>
    </footer>
  );
}
