'use client';

import { EVENT_CATEGORIES, EVENT_VISIBILITIES, type EventCategory, type EventVisibility } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import { isoToLocalInput, localInputToIso } from '@/lib/datetime';
import type { MyEvent } from '@/lib/types';
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {saved ? <Alert kind="success">{tc('saved')}</Alert> : null}
      <fieldset disabled={disabled || busy} className="flex flex-col gap-4">
        <Field label={t('title')} htmlFor="title" error={err('title')}>
          <Input id="title" name="title" required minLength={3} maxLength={120} defaultValue={initial?.title} invalid={invalid.has('title')} />
        </Field>

        <Field label={t('category')} htmlFor="category" error={err('category')}>
          <select
            id="category"
            name="category"
            defaultValue={initial?.category ?? 'OTHER'}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tcat(c)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('startsAt')} htmlFor="startsAt" error={err('startsAt')}>
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={initial ? isoToLocalInput(initial.startsAt, initial.timezone) : undefined}
              invalid={invalid.has('startsAt')}
            />
          </Field>
          <Field label={t('endsAt')} htmlFor="endsAt" error={err('endsAt')} hint={t('timezoneNote')}>
            <Input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={initial ? isoToLocalInput(initial.endsAt, initial.timezone) : undefined}
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

        <div className="grid gap-4 sm:grid-cols-2">
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
            />
          </Field>
        </div>

        {/* Цээжний дугаар таних хойшлогдсон (ARCHITECTURE #11) — талбарыг нуугаад хуучин утгыг хадгална */}
        <input type="hidden" name="bibPattern" defaultValue={initial?.bibPattern ?? ''} />

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="faceSearchEnabled"
            defaultChecked={initial?.faceSearchEnabled ?? true}
            className="mt-1 size-5 accent-brand-600"
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ink">{t('faceSearch')}</span>
            <span className="text-sm text-ink-soft">{t('faceSearchHint')}</span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">{t('visibility')}</legend>
          {EVENT_VISIBILITIES.map((v) => (
            <label key={v} className="flex items-center gap-3 text-sm">
              <input
                type="radio"
                name="visibility"
                value={v}
                defaultChecked={(initial?.visibility ?? 'HIDDEN') === v}
                className="size-4 accent-brand-600"
              />
              {t(`visibility_${v}`)}
            </label>
          ))}
        </fieldset>

        {!disabled ? (
          <Button type="submit" className="self-start">
            {busy ? busyLabel : submitLabel}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
