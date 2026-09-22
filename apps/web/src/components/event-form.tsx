'use client';

import { EVENT_CATEGORIES, EVENT_VISIBILITIES, type EventCategory, type EventVisibility } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import { describeLocalInput, isoToLocalInput, localInputToIso } from '@/lib/datetime';
import type { MyEvent } from '@/lib/types';
import { ChevronDownIcon } from './icons';
import { Alert, Button, Field, Input, Textarea } from './ui';

export interface EventFormValues {
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  pricePerPhoto: number;
  bundlePrice: number | null;
  bibPattern: string | null;
  faceSearchEnabled: boolean;
  visibility: EventVisibility;
}

/** Маягтын утгыг API-ийн хэлбэрт хувиргана (хоосон мөр → null, огноо → offset-тэй ISO). */
function readForm(form: FormData): EventFormValues {
  const text = (name: string) => {
    const v = String(form.get(name) ?? '').trim();
    return v === '' ? null : v;
  };
  const int = (name: string) => {
    const v = text(name);
    return v === null ? null : Number(v);
  };
  return {
    title: text('title') ?? '',
    description: text('description'),
    location: text('location'),
    category: String(form.get('category')) as EventCategory,
    startsAt: localInputToIso(String(form.get('startsAt'))),
    endsAt: localInputToIso(String(form.get('endsAt'))),
    pricePerPhoto: int('pricePerPhoto') ?? 0,
    bundlePrice: int('bundlePrice'),
    bibPattern: text('bibPattern'),
    faceSearchEnabled: form.get('faceSearchEnabled') === 'on',
    visibility: String(form.get('visibility')) as EventVisibility,
  };
}

export function EventForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  disabled = false,
}: {
  initial?: MyEvent;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (values: EventFormValues) => Promise<ApiError | null>;
  disabled?: boolean;
}) {
  const t = useTranslations('eventForm');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const tcat = useTranslations('categories');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [startsAt, setStartsAt] = useState(initial ? isoToLocalInput(initial.startsAt, initial.timezone) : '');
  const [endsAt, setEndsAt] = useState(initial ? isoToLocalInput(initial.endsAt, initial.timezone) : '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const invalid = fieldErrors(error);
  const err = (name: string) => (invalid.has(name) ? te('invalid_field') : undefined);
  const optional = (label: string) => `${label} (${tc('optional')})`;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await onSubmit(readForm(new FormData(e.currentTarget)));
    setBusy(false);
    setError(result);
    setSaved(result === null && initial !== undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {saved ? <Alert kind="success">{tc('saved')}</Alert> : null}
      <fieldset disabled={disabled || busy} className="flex flex-col gap-10">
        <Section index="01" title={t('sectionInfo')}>
          <Field label={t('title')} htmlFor="title" error={err('title')}>
            <Input id="title" name="title" required minLength={3} maxLength={120} defaultValue={initial?.title} invalid={invalid.has('title')} />
          </Field>

          <Field label={t('category')} htmlFor="category" error={err('category')}>
            <div className="relative">
              <select
                id="category"
                name="category"
                defaultValue={initial?.category ?? 'OTHER'}
                className="min-h-13 w-full cursor-pointer appearance-none rounded-[10px] bg-night-2 px-4 pr-11 text-base text-ivory outline-none ring-1 ring-inset ring-line-strong transition hover:ring-mist focus:ring-2 focus:ring-gold"
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tcat(c)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mist" />
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('startsAt')} htmlFor="startsAt" error={err('startsAt')} hint={describeLocalInput(startsAt)}>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                invalid={invalid.has('startsAt')}
              />
            </Field>
            <Field label={t('endsAt')} htmlFor="endsAt" error={err('endsAt')} hint={describeLocalInput(endsAt) || t('timezoneNote')}>
              <Input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                invalid={invalid.has('endsAt')}
              />
            </Field>
          </div>

          <Field label={optional(t('location'))} htmlFor="location" error={err('location')}>
            <Input id="location" name="location" maxLength={200} defaultValue={initial?.location ?? ''} />
          </Field>

          <Field label={optional(t('description'))} htmlFor="description" error={err('description')}>
            <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={initial?.description ?? ''} />
          </Field>
        </Section>

        <Section index="02" title={t('sectionPrice')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('pricePerPhoto')} htmlFor="pricePerPhoto" error={err('pricePerPhoto')}>
              <Input
                id="pricePerPhoto"
                name="pricePerPhoto"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                required
                defaultValue={initial?.pricePerPhoto ?? 10000}
                invalid={invalid.has('pricePerPhoto')}
                className="font-display text-xl font-semibold tabular-nums"
              />
            </Field>
            <Field label={optional(t('bundlePrice'))} htmlFor="bundlePrice" hint={t('bundleHint')} error={err('bundlePrice')}>
              <Input
                id="bundlePrice"
                name="bundlePrice"
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                defaultValue={initial?.bundlePrice ?? ''}
                invalid={invalid.has('bundlePrice')}
                className="font-display text-xl font-semibold tabular-nums"
              />
            </Field>
          </div>
        </Section>

        {/* Цээжний дугаар таних хойшлогдсон (ARCHITECTURE #11) — талбарыг нуугаад хуучин утгыг хадгална */}
        <input type="hidden" name="bibPattern" defaultValue={initial?.bibPattern ?? ''} />

        <Section index="03" title={t('sectionAccess')}>
          {/* Шилжүүлэгч: жинхэнэ checkbox, дүрс нь зөвхөн харагдах байдал */}
          <label className="flex cursor-pointer items-start gap-4 rounded-[14px] bg-night-2 p-4 ring-1 ring-inset ring-line transition hover:ring-line-strong has-focus-visible:ring-2 has-focus-visible:ring-gold">
            <input type="checkbox" name="faceSearchEnabled" defaultChecked={initial?.faceSearchEnabled ?? true} className="peer sr-only" />
            <span
              aria-hidden
              className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-night-4 ring-1 ring-inset ring-line-strong transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-mist after:transition after:duration-300 after:ease-cine peer-checked:bg-gold peer-checked:ring-gold peer-checked:after:translate-x-5 peer-checked:after:bg-night"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-ivory">{t('faceSearch')}</span>
              <span className="text-sm text-mist">{t('faceSearchHint')}</span>
            </span>
          </label>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ivory">{t('visibility')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {EVENT_VISIBILITIES.map((v) => (
                <label
                  key={v}
                  className="flex cursor-pointer flex-col gap-2 rounded-[14px] bg-night-2 p-4 ring-1 ring-inset ring-line transition hover:ring-line-strong has-checked:bg-gold/[0.07] has-checked:ring-2 has-checked:ring-gold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ivory">{t(`badge_${v}`)}</span>
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      defaultChecked={(initial?.visibility ?? 'HIDDEN') === v}
                      className="size-5 shrink-0 cursor-pointer accent-gold"
                    />
                  </span>
                  <span className="text-sm text-mist">{t(`visibilityHint_${v}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        {!disabled ? (
          <Button type="submit" size="lg" busy={busy} className="self-start">
            {busy ? busyLabel : submitLabel}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}

/** Маягтын хэсэг: timecode дугаар + гарчиг */
function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h3 className="flex items-baseline gap-3 border-b border-line pb-3">
        <span className="font-mono text-xs text-gold">{index}</span>
        <span className="font-display text-2xl font-semibold leading-none">{title}</span>
      </h3>
      {children}
    </section>
  );
}
