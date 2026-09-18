'use client';

import { ExternalLinkIcon } from '@/components/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Alert, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import type { MyProfile } from '@/lib/types';

export function ProfileForm({ initial }: { initial: MyProfile }) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const invalid = fieldErrors(error);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await api<MyProfile>('/photographer/profile', {
      method: 'PUT',
      body: {
        displayName: form.get('displayName'),
        slug: form.get('slug'),
        city: form.get('city') || undefined,
        bio: form.get('bio') || undefined,
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setProfile(res.data);
    setSaved(true);
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/api/photographer/profile/avatar', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { avatarUrl?: string; code?: string };
    if (!res.ok || !body.avatarUrl) return setError({ status: res.status, code: body.code ?? 'invalid_image' });
    setProfile((p) => ({ ...p, avatarUrl: body.avatarUrl! }));
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {profile.slugSaved ? (
          <Link href={`/photographers/${profile.slug}`} className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
            {t('view')}
            <ExternalLinkIcon size={14} />
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-stone-600">{profile.slugSaved ? t('publicNote') : t('notPublished')}</p>

      <Card className="flex items-center gap-4">
        <Avatar url={profile.avatarUrl} name={profile.displayName} size={80} />
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium">
          {t('avatar')}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e)} />
        </label>
      </Card>

      <Card>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
          {saved ? <Alert kind="success">{tc('saved')}</Alert> : null}
          {error && !invalid.size ? <Alert>{errorMessage(error)}</Alert> : null}
          <Field label={t('displayName')} htmlFor="displayName">
            <Input id="displayName" name="displayName" required minLength={2} maxLength={100} defaultValue={profile.displayName} />
          </Field>
          <Field
            label={t('slug')}
            hint={t('slugHint', { slug: profile.slug })}
            error={invalid.has('slug') ? t('slugInvalid') : error?.code === 'slug_taken' ? errorMessage(error) : undefined}
            htmlFor="slug"
          >
            <Input id="slug" name="slug" required minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={profile.slug} invalid={invalid.has('slug')} />
          </Field>
          <Field label={t('city')} htmlFor="city">
            <Input id="city" name="city" maxLength={60} defaultValue={profile.city ?? ''} />
          </Field>
          <Field label={t('bio')} hint={t('bioHint')} htmlFor="bio">
            <Textarea id="bio" name="bio" rows={4} maxLength={1000} defaultValue={profile.bio ?? ''} />
          </Field>
          <Button type="submit" disabled={busy} className="self-start">
            {profile.slugSaved ? tc('save') : t('publish')}
          </Button>
        </form>
      </Card>
    </>
  );
}
