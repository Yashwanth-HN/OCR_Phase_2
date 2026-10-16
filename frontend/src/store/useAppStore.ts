import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, isAbortError } from '@/api';
import {
  BATCH_CONCURRENCY,
  DEFAULT_ENHANCE,
  HISTORY_LIMIT,
  STORAGE_KEY,
} from '@/lib/constants';
import { isImageFile } from '@/lib/files';
import { newId } from '@/lib/id';
import { displayStatus, jobLines, jobText } from '@/lib/job';
import type {
  EnhanceSettings,
  HistoryEntry,
  Job,
  Locale,
  OcrMode,
  TextType,
  ThemePref,
} from '@/types';

export interface Settings {
  locale: Locale;
  theme: ThemePref;
  mode: OcrMode;
  textType: TextType;
  enhance: EnhanceSettings;
}

const DEFAULT_SETTINGS: Settings = {
  locale: 'kn',
  theme: 'system',
  mode: 'paragraph',
  textType: 'printed',
  enhance: DEFAULT_ENHANCE,
};

interface AppState {
  settings: Settings;
  history: HistoryEntry[];
  /** In-memory jobs (they hold File objects, so they are not persisted). */
  jobs: Record<string, Job>;
  /** Jobs shown on the batch page, in upload order. */
  batchIds: string[];

  setSettings: (patch: Partial<Settings>) => void;

  createJobs: (files: File[]) => string[];
  setBatch: (ids: string[]) => void;
  appendToBatch: (ids: string[]) => void;
  runJob: (id: string) => Promise<void>;
  processQueue: (ids: string[]) => Promise<void>;
  cancelJob: (id: string) => void;
  removeJob: (id: string) => void;
  updateJob: (id: string, patch: Partial<Job>) => void;
  changeMode: (id: string, mode: OcrMode) => Promise<void>;
  setEditedText: (id: string, text: string | undefined) => void;
  chooseLine: (id: string, lineId: string, text: string) => void;
  openFromHistory: (id: string) => boolean;

  deleteHistory: (id: string) => void;
  clearHistory: () => void;
}

/** One AbortController per running job. Not part of React state. */
const controllers = new Map<string, AbortController>();

function toHistoryEntry(job: Job): HistoryEntry | null {
  if (job.state !== 'ready' || !job.result) return null;
  const status = displayStatus(job);
  if (status !== 'done' && status !== 'review' && status !== 'edited') return null;
  return {
    id: job.id,
    fileName: job.fileName,
    fileType: job.fileType,
    mode: job.mode,
    textType: job.textType,
    enhance: job.enhance,
    // Preview URLs are blob/remote URLs that will not survive a reload.
    result: { ...job.result, pages: job.result.pages.map((p) => ({ ...p, previewUrl: undefined })) },
    lineOverrides: job.lineOverrides,
    editedText: job.editedText,
    status,
    text: jobText(job),
    lineCount: jobLines(job).length,
    createdAt: job.createdAt,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const syncHistory = (id: string) => {
        const job = get().jobs[id];
        if (!job) return;
        const entry = toHistoryEntry(job);
        if (!entry) return;
        set((s) => ({
          history: [entry, ...s.history.filter((h) => h.id !== id)].slice(0, HISTORY_LIMIT),
        }));
      };

      return {
        settings: DEFAULT_SETTINGS,
        history: [],
        jobs: {},
        batchIds: [],

        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        createJobs: (files) => {
          const { mode, textType, enhance } = get().settings;
          const created: Job[] = files.map((file) => ({
            id: newId(),
            fileName: file.name,
            fileType: file.type,
            file,
            previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
            mode,
            textType,
            enhance: { ...enhance },
            state: 'queued',
            lineOverrides: {},
            createdAt: Date.now(),
          }));
          set((s) => ({
            jobs: { ...s.jobs, ...Object.fromEntries(created.map((j) => [j.id, j])) },
          }));
          return created.map((j) => j.id);
        },

        setBatch: (ids) => set({ batchIds: ids }),
        appendToBatch: (ids) => set((s) => ({ batchIds: [...s.batchIds, ...ids] })),

        updateJob: (id, patch) =>
          set((s) => {
            const job = s.jobs[id];
            return job ? { jobs: { ...s.jobs, [id]: { ...job, ...patch } } } : s;
          }),

        runJob: async (id) => {
          const job = get().jobs[id];
          if (!job?.file) return;
          controllers.get(id)?.abort();
          const controller = new AbortController();
          controllers.set(id, controller);
          get().updateJob(id, { state: 'processing', error: undefined });
          try {
            const result = await api.recognize({
              file: job.file,
              mode: job.mode,
              textType: job.textType,
              enhance: job.enhance,
              signal: controller.signal,
            });
            if (controller.signal.aborted || !get().jobs[id]) return;
            get().updateJob(id, {
              state: 'ready',
              result,
              lineOverrides: {},
              editedText: undefined,
              error: undefined,
            });
            syncHistory(id);
          } catch (error) {
            if (!get().jobs[id]) return;
            const cancelled = controller.signal.aborted || isAbortError(error);
            get().updateJob(id, {
              state: 'error',
              error: cancelled ? 'cancelled' : error instanceof Error ? error.message : 'error',
            });
          } finally {
            if (controllers.get(id) === controller) controllers.delete(id);
          }
        },

        processQueue: async (ids) => {
          const pending = [...ids];
          const worker = async () => {
            for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
              if (get().jobs[id]?.state === 'queued') await get().runJob(id);
            }
          };
          await Promise.all(
            Array.from({ length: Math.min(BATCH_CONCURRENCY, pending.length) }, worker),
          );
        },

        cancelJob: (id) => {
          controllers.get(id)?.abort();
          const job = get().jobs[id];
          if (job?.state === 'queued') get().updateJob(id, { state: 'error', error: 'cancelled' });
        },

        removeJob: (id) => {
          controllers.get(id)?.abort();
          controllers.delete(id);
          const job = get().jobs[id];
          if (job?.previewUrl) URL.revokeObjectURL(job.previewUrl);
          set((s) => {
            const { [id]: _removed, ...rest } = s.jobs;
            void _removed;
            return { jobs: rest, batchIds: s.batchIds.filter((b) => b !== id) };
          });
        },

        changeMode: async (id, mode) => {
          const job = get().jobs[id];
          if (!job || job.mode === mode) return;
          get().updateJob(id, { mode });
          await get().runJob(id);
        },

        setEditedText: (id, text) => {
          get().updateJob(id, { editedText: text });
          syncHistory(id);
        },

        chooseLine: (id, lineId, text) => {
          const job = get().jobs[id];
          if (!job) return;
          get().updateJob(id, { lineOverrides: { ...job.lineOverrides, [lineId]: text } });
          syncHistory(id);
        },

        openFromHistory: (id) => {
          if (get().jobs[id]) return true;
          const entry = get().history.find((h) => h.id === id);
          if (!entry) return false;
          const job: Job = {
            id: entry.id,
            fileName: entry.fileName,
            fileType: entry.fileType,
            mode: entry.mode,
            textType: entry.textType,
            enhance: entry.enhance,
            state: 'ready',
            result: entry.result,
            lineOverrides: entry.lineOverrides,
            editedText: entry.editedText,
            createdAt: entry.createdAt,
          };
          set((s) => ({ jobs: { ...s.jobs, [id]: job } }));
          return true;
        },

        deleteHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
        clearHistory: () => set({ history: [] }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ settings: s.settings, history: s.history }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<AppState, 'settings' | 'history'>>;
        return {
          ...current,
          settings: {
            ...current.settings,
            ...saved.settings,
            enhance: { ...current.settings.enhance, ...saved.settings?.enhance },
          },
          history: Array.isArray(saved.history) ? saved.history : [],
        };
      },
    },
  ),
);

export function useJob(id: string | undefined): Job | undefined {
  return useAppStore((s) => (id ? s.jobs[id] : undefined));
}
