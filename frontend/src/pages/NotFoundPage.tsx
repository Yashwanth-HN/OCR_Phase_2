import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="page-center">
      <h1 className="page__title">404</h1>
      <p>{t('err.notFound')}</p>
      <Link to="/" className="btn btn--primary">
        {t('err.home')}
      </Link>
    </div>
  );
}
