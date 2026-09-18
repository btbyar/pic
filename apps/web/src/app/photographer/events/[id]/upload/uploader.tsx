'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';
import type { PhotoStats } from '@/lib/types';
import { runUpload, UPLOAD_BATCH_MAX_FILES, type UploadItem } from '@/lib/uploader';

const ACCEPT = 'image/jpeg,image/png,image/webp';
/** 500+ файлын явцыг секундэд 4 удаагаас илүү render хийхгүй */
const RENDER_INTERVAL_MS = 250;

export function Uploader({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const t = useTranslations('upload');
  const errorMessage = useErrorMessage();
  const items = useRef<UploadItem[]>([]);
  const abort = useRef<AbortController | null>(null);
  const [, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PhotoStats | null>(null);

  const refreshStats = useCallback(async () => {
    const res = await api<PhotoStats>(`/photographer/events/${eventId}/photo-stats`);
    if (res.ok) setStats(res.data);
  }, [eventId]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  // Worker боловсруулж дуустал тоог шинэчилнэ
  const processing = stats?.byStatus.UPLOADED ?? 0;
  useEffect(() => {
    if (processing === 0) return;
    const timer = setInterval(() => void refreshStats(), 3000);
    return () => clearInterval(timer);
  }, [processing, refreshStats]);

  // Байршуулж байхад хуудас хаахаас сэрэмжлүүлнэ
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  // Явцын render-ийг хязгаарлана
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), RENDER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [running]);

  async function start(files: File[]) {
    if (running || files.length === 0) return;
    if (files.length > UPLOAD_BATCH_MAX_FILES) {
      setError(t('tooManyFiles', { max: UPLOAD_BATCH_MAX_FILES }));
      return;
    }
    setError(null);
    items.current = files.map((file) => ({ file, state: 'queued', sent: 0 }));
    abort.current = new AbortController();
    setRunning(true);
    const res = await runUpload(eventId, items.current, () => {}, abort.current.signal);
    if (!res.ok) setError(errorMessage(res.error));
    setRunning(false);
    setTick((n) => n + 1);
    void refreshStats();
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void start(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void start(Array.from(e.dataTransfer.files));
  };

  const list = items.current;
  const count = (...states: UploadItem['state'][]) => list.filter((i) => states.includes(i.state)).length;
  const totalBytes = list.filter((i) => i.state !== 'rejected').reduce((s, i) => s + i.file.size, 0);
  const doneBytes = list.reduce(
    (s, i) => s + (i.state === 'done' || i.state === 'duplicate' ? i.file.size : i.state === 'uploading' ? i.sent : 0),
    0,
  );
  const percent = totalBytes ? Math.min(100, Math.round((doneBytes / totalBytes) * 100)) : 0;
  const problems = list.filter((i) => i.state === 'failed' || i.state === 'rejected');
  const retryable = list.filter((i) => i.state === 'failed').map((i) => i.file);
  const finished = !running && list.length > 0;

  return (
    <>
      <BackLink href={`/photographer/events/${eventId}`}>{eventTitle}</BackLink>
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {stats ? (
        <p className="text-sm text-stone-600">
          {t('eventStats', { total: stats.total, processing: stats.byStatus.UPLOADED, ready: stats.byStatus.DERIVED + stats.byStatus.INDEXED, failed: stats.byStatus.FAILED })}
        </p>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      <Card className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center ${
            dragging ? 'border-stone-900 bg-stone-50' : 'border-stone-300'
          }`}
        >
          <p className="font-medium">{t('dropHere')}</p>
          <p className="text-sm text-stone-500">{t('formats')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white ${running ? 'pointer-events-none opacity-50' : ''}`}>
              {t('pickFiles')}
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={onPick} disabled={running} />
            </label>
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-stone-300 px-4 text-sm font-medium ${running ? 'pointer-events-none opacity-50' : ''}`}>
              {t('pickFolder')}
              {/* webkitdirectory нь стандарт бус боловч бүх орчин үеийн desktop браузер дэмждэг */}
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={onPick}
                disabled={running}
                {...({ webkitdirectory: '' } as Record<string, string>)}
              />
            </label>
          </div>
        </div>
        <p className="text-sm text-stone-500">{t('resumeHint')}</p>
      </Card>

      {list.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{running ? t('inProgress') : t('finished')}</h2>
            {running ? (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                {t('cancel')}
              </Button>
            ) : null}
          </div>

          <div
            className="h-3 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${percent}%` }} />
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label={t('stat.done')} value={count('done')} />
            <Stat label={t('stat.duplicate')} value={count('duplicate')} />
            <Stat label={t('stat.pending')} value={count('queued', 'hashing', 'uploading')} />
            <Stat label={t('stat.failed')} value={problems.length} tone={problems.length ? 'red' : undefined} />
          </dl>

          {finished && problems.length === 0 ? <Alert kind="success">{t('allDone')}</Alert> : null}

          {problems.length > 0 ? (
            <div className="flex flex-col gap-2">
              <ul className="max-h-64 overflow-y-auto rounded-xl border border-stone-200 text-sm">
                {problems.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 border-b border-stone-100 px-3 py-2 last:border-0">
                    <span className="truncate">{i.file.name}</span>
                    <span className="shrink-0 text-red-700">{t(`problem.${i.problem ?? 'server'}`)}</span>
                  </li>
                ))}
              </ul>
              {finished && retryable.length > 0 ? (
                <Button onClick={() => void start(retryable)} className="self-start">
                  {t('retryFailed', { count: retryable.length })}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' | undefined }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className={`text-lg font-semibold ${tone === 'red' ? 'text-red-700' : ''}`}>{value}</dd>
    </div>
  );
}
