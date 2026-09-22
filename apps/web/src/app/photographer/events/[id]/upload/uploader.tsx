'use client';

import { BackLink } from '@/components/back-link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, RefreshIcon, UploadIcon } from '@/components/icons';
import { Alert, Button, buttonClass, PageHeader } from '@/components/ui';
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
    { key: 'done', value: count('done'), bar: 'bg-jade' },
    { key: 'duplicate', value: count('duplicate'), bar: 'bg-gold-soft' },
    { key: 'failed', value: problems.length, bar: 'bg-ember' },
  ];

  const ready = stats ? stats.byStatus.DERIVED + stats.byStatus.INDEXED : 0;
  const pickDisabled = running ? 'pointer-events-none opacity-50' : '';

  return (
    <>
      <BackLink href={`/photographer/events/${eventId}`}>{eventTitle}</BackLink>
      <PageHeader kicker={t('kicker')} title={t('title')} />

      {/* Эвэнтийн зургийн тоолуур: нийт · бэлэн · боловсруулж буй · амжилтгүй */}
      {stats ? (
        <dl className="grid animate-rise grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-line ring-1 ring-line stagger [--i:2] sm:grid-cols-4">
          {[
            { key: 'total', value: stats.total, tone: '' },
            { key: 'ready', value: ready, tone: 'text-jade' },
            { key: 'processing', value: stats.byStatus.UPLOADED, tone: 'text-gold' },
            { key: 'broken', value: stats.byStatus.FAILED, tone: stats.byStatus.FAILED ? 'text-ember' : 'text-dim' },
          ].map((s) => (
            <div key={s.key} className="flex flex-col gap-1.5 bg-night-2 px-4 py-3.5">
              <dt className="kicker flex items-center gap-2">
                {s.key === 'processing' && s.value ? <span aria-hidden className="size-1.5 animate-blink rounded-full bg-gold" /> : null}
                {t(`counter.${s.key}`)}
              </dt>
              <dd className={`font-display text-3xl font-semibold leading-none tabular-nums ${s.tone}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="skeleton h-[5.25rem] rounded-[14px]" />
      )}

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-dashed px-5 py-14 text-center transition duration-500 ease-cine sm:py-20 ${
            dragging ? 'scale-[1.01] border-gold bg-gold/[0.08]' : 'border-line-strong bg-night-2/60'
          }`}
        >
          <div
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition duration-500 ${dragging ? 'bg-gold/30' : 'bg-gold/10'}`}
          />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-night-3 text-gold ring-1 ring-line" aria-hidden>
            {dragging ? <span className="absolute inset-0 animate-ripple rounded-full ring-2 ring-gold" /> : null}
            <UploadIcon size={32} />
          </span>
          <p className="max-w-md font-display text-3xl font-semibold leading-tight sm:text-4xl">{t('dropHere')}</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">{t('formats')}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <label className={`${buttonClass('primary')} has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-gold ${pickDisabled}`}>
              {t('pickFiles')}
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={onPick} disabled={running} />
            </label>
            <label className={`${buttonClass('secondary')} has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-gold ${pickDisabled}`}>
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
        <p className="max-w-2xl text-sm text-mist">{t('resumeHint')}</p>
      </div>

      {list.length > 0 ? (
        <section className="panel flex animate-rise flex-col gap-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="kicker flex items-center gap-2">
                {running ? <span aria-hidden className="size-1.5 animate-blink rounded-full bg-ember" /> : null}
                {running ? t('inProgress') : t('finished')}
              </span>
              <span className="font-display text-7xl font-semibold leading-[0.8] tabular-nums tracking-[-0.03em]">
                {percent}
                <span className="text-4xl text-gold">%</span>
              </span>
            </div>
            {running ? (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                {t('cancel')}
              </Button>
            ) : null}
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-night-4" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('title')}>
            {/* Хэсэгчилсэн мөр: орсон · өмнө орсон · амжилтгүй (файлын тоогоор); байт явц нь % дээр */}
            <div className="flex h-full">
              {segments.map((seg) =>
                seg.value ? <div key={seg.key} className={`h-full transition-[width] duration-300 ${seg.bar}`} style={{ width: `${(seg.value / list.length) * 100}%` }} /> : null,
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[...segments, { key: 'pending', value: count('queued', 'hashing', 'uploading'), bar: 'bg-night-4 ring-1 ring-line-strong' }].map((seg) => (
              <div key={seg.key} className="flex flex-col gap-1">
                <dt className="flex items-center gap-2 text-xs text-mist">
                  <span className={`size-2 rounded-full ${seg.bar}`} aria-hidden />
                  {t(`stat.${seg.key}`)}
                </dt>
                <dd className={`font-display text-2xl font-semibold tabular-nums ${seg.key === 'failed' && seg.value ? 'text-ember' : ''}`}>{seg.value}</dd>
              </div>
            ))}
          </dl>

          {finished && problems.length === 0 ? <Alert kind="success">{t('allDone')}</Alert> : null}

          {problems.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <p className="flex items-center gap-2 font-semibold">
                <AlertIcon size={18} className="text-ember" />
                {t('problemsTitle', { count: problems.length })}
              </p>
              <ul className="flex max-h-64 flex-col overflow-y-auto rounded-xl bg-night text-sm ring-1 ring-inset ring-line">
                {problems.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 border-b border-line px-3 py-2.5 last:border-0">
                    <span className="truncate font-mono text-xs text-mist">{i.file.name}</span>
                    <span className="shrink-0 text-xs text-ember">{t(`problem.${i.problem ?? 'server'}`)}</span>
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
        </section>
      ) : null}
    </>
  );
}
