import { serverApi } from '@/lib/api-server';
import type { MyProfile } from '@/lib/types';
import { ProfileForm } from './profile-form';

export default async function MyProfilePage() {
  const { data } = await serverApi<MyProfile>('/photographer/profile');
  if (!data) return null;
  return <ProfileForm initial={data} />;
}
