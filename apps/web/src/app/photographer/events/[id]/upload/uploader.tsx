'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, RefreshIcon, UploadIcon } from '@/components/icons';
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
  const segments = [
    { key: 'done', value: count('done'), bar: 'bg-emerald-700' },
    { key: 'duplicate', value: count('duplicate'), bar: 'bg-brand-200' },
    { key: 'failed', value: problems.length, bar: 'bg-red-600' },
  ];

  return (
    <>
      <BackLink href={`/photographer/events/${eventId}`}>{eventTitle}</BackLink>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>

      {stats ? (
        <p className="text-sm text-ink-soft">
          {t('eventStats', { total: stats.total, processing: stats.byStatus.UPLOADED, ready: stats.byStatus.DERIVED + stats.byStatus.INDEXED, failed: stats.byStatus.FAILED })}
        </p>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-4 py-12 text-center transition ${
            dragging ? 'border-brand-600 bg-brand-100' : 'border-brand-200 bg-brand-50'
          }`}
        >
          <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-brand-600" aria-hidden>
            <UploadIcon size={30} />
          </span>
          <p className="font-display text-xl font-bold">{t('dropHere')}</p>
          <p className="text-sm text-ink-soft">{t('formats')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-on-brand hover:bg-brand-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${running ? 'pointer-events-none opacity-50' : ''}`}>
              {t('pickFiles')}
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={onPick} disabled={running} />
            </label>
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-strong bg-surface-2 px-5 text-sm font-semibold text-ink hover:bg-surface-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${running ? 'pointer-events-none opacity-50' : ''}`}>
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
        <p className="text-sm text-ink-soft">{t('resumeHint')}</p>
      </div>

      {list.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{running ? t('inProgress') : t('finished')}</h2>
            <span className="ml-auto font-display text-lg font-bold tabular-nums text-brand-700">{percent}%</span>
            {running ? (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                {t('cancel')}
              </Button>
            ) : null}
          </div>

          <div
            className="h-3 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* Хэсэгчилсэн мөр: орсон · өмнө орсон · амжилтгүй (файлын тоогоор); байт явц нь % дээр */}
            <div className="flex h-full">
              {segments.map((seg) =>
                seg.value ? <div key={seg.key} className={`h-full transition-[width] ${seg.bar}`} style={{ width: `${(seg.value / list.length) * 100}%` }} /> : null,
              )}
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {[...segments, { key: 'pending', value: count('queued', 'hashing', 'uploading'), bar: 'bg-surface-3 ring-1 ring-line-strong' }].map((seg) => (
              <div key={seg.key} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${seg.bar}`} aria-hidden />
                <dt className="text-ink-soft">{t(`stat.${seg.key}`)}</dt>
                <dd className={`font-bold tabular-nums ${seg.key === 'failed' && seg.value ? 'text-red-700' : ''}`}>{seg.value}</dd>
              </div>
            ))}
          </dl>

          {finished && problems.length === 0 ? <Alert kind="success">{t('allDone')}</Alert> : null}

          {problems.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-semibold">
                <AlertIcon size={18} className="text-red-700" />
                {t('problemsTitle', { count: problems.length })}
              </p>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                {problems.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                    <span className="truncate">{i.file.name}</span>
                    <span className="shrink-0 text-red-700">{t(`problem.${i.problem ?? 'server'}`)}</span>
                  </li>
                ))}
              </ul>
              {finished && retryable.length > 0 ? (
                <Button variant="secondary" onClick={() => void start(retryable)} className="gap-2 self-start">
                  <RefreshIcon size={18} />
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

