'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { CameraIcon, ExternalLinkIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import type { MyProfile } from '@/lib/types';

export function ProfileForm({ initial }: { initial: MyProfile }) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [profile, setProfile] = useState(initial);
  // Урьдчилан харах картад бичиж буй утгыг шууд тусгана
  const [draft, setDraft] = useState({ displayName: initial.displayName, city: initial.city ?? '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    setUploading(true);
    const res = await fetch('/api/photographer/profile/avatar', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = (await res.json().catch(() => ({}))) as { avatarUrl?: string; code?: string };
    setUploading(false);
    if (!res.ok || !body.avatarUrl) return setError({ status: res.status, code: body.code ?? 'invalid_image' });
    setProfile((p) => ({ ...p, avatarUrl: body.avatarUrl! }));
  }

  return (
    <>
      <PageHeader
        kicker={t('kicker')}
        title={t('title')}
        intro={<p>{profile.slugSaved ? t('publicNote') : t('notPublished')}</p>}
        action={
          profile.slugSaved ? (
            <Link
              href={`/photographers/${profile.slug}`}
              className="glass inline-flex min-h-12 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition hover:bg-white/10"
            >
              {t('view')}
              <ExternalLinkIcon size={15} />
            </Link>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="animate-rise stagger [--i:3]">
          <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6">
            {/* Зураг: дугуй дээр дарж солино */}
            <div className="flex items-center gap-5">
              <label className="group relative cursor-pointer rounded-full has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-gold">
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={88} />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-night/60 text-ivory opacity-0 transition group-hover:opacity-100">
                  {uploading ? <Spinner className="size-6" /> : <CameraIcon size={24} />}
                </span>
                <span className="sr-only">{t('avatar')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e)} disabled={uploading} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t('avatar')}</span>
                <span className="text-sm text-mist">{t('avatarHint')}</span>
              </div>
            </div>

            {saved ? <Alert kind="success">{tc('saved')}</Alert> : null}
            {error && !invalid.size ? <Alert>{errorMessage(error)}</Alert> : null}
            <Field label={t('displayName')} htmlFor="displayName">
              <Input
                id="displayName"
                name="displayName"
                required
                minLength={2}
                maxLength={100}
                defaultValue={profile.displayName}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              />
            </Field>
            <Field
              label={t('slug')}
              hint={t('slugHint', { slug: profile.slug })}
              error={invalid.has('slug') ? t('slugInvalid') : error?.code === 'slug_taken' ? errorMessage(error) : undefined}
              htmlFor="slug"
            >
              <Input
                id="slug"
                name="slug"
                required
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                defaultValue={profile.slug}
                invalid={invalid.has('slug')}
                className="font-mono"
              />
            </Field>
            <Field label={t('city')} htmlFor="city">
              <Input id="city" name="city" maxLength={60} defaultValue={profile.city ?? ''} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
            </Field>
            <Field label={t('bio')} hint={t('bioHint')} htmlFor="bio">
              <Textarea id="bio" name="bio" rows={4} maxLength={1000} defaultValue={profile.bio ?? ''} />
            </Field>
            <Button type="submit" size="lg" busy={busy} className="self-start">
              {profile.slugSaved ? tc('save') : t('publish')}
            </Button>
          </form>
        </Card>

        {/* Оролцогчид таныг ингэж харна — дарахад шилжихгүй */}
        <aside className="flex animate-rise flex-col gap-3 stagger [--i:4] lg:sticky lg:top-8">
          <span className="kicker">{t('preview')}</span>
          <div inert className="pointer-events-none">
            <PhotographerCard
              p={{
                slug: profile.slug,
                displayName: draft.displayName || profile.displayName,
                city: draft.city || null,
                bio: null,
                avatarUrl: profile.avatarUrl,
                coverUrl: null,
                eventCount: 0,
              }}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
