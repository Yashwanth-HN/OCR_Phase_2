import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { validateFiles } from '@/lib/files';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';

/** Validates incoming files, reports problems, and turns the good ones into jobs. */
export function useIngest() {
  const { t } = useI18n();
  const push = useToasts((s) => s.push);
  const navigate = useNavigate();

  const validate = useCallback(
    (files: File[]): File[] => {
      const { valid, issues } = validateFiles(files);
      for (const issue of issues) {
        push(
          t(issue.kind === 'type' ? 'upload.errorType' : 'upload.errorSize', { name: issue.name }),
          'error',
        );
      }
      return valid;
    },
    [push, t],
  );

  /** Home page: one file opens the workspace, several open the batch screen. */
  const start = useCallback(
    (files: File[]) => {
      const valid = validate(files);
      if (valid.length === 0) return;
      const store = useAppStore.getState();
      const ids = store.createJobs(valid);
      const [first] = ids;
      if (ids.length === 1 && first) {
        void store.runJob(first);
        navigate(`/workspace/${first}`);
      } else {
        store.setBatch(ids);
        void store.processQueue(ids);
        navigate('/batch');
      }
    },
    [validate, navigate],
  );

  /** Batch page: add files to the current batch and start processing them. */
  const addToBatch = useCallback(
    (files: File[]) => {
      const valid = validate(files);
      if (valid.length === 0) return;
      const store = useAppStore.getState();
      const ids = store.createJobs(valid);
      store.appendToBatch(ids);
      void store.processQueue(ids);
    },
    [validate],
  );

  return { start, addToBatch };
}
