'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getAuthUser } from '@/lib/auth';

export default function ConsolePage() {
  const router = useRouter();
  useEffect(() => {
    const token = getToken();
    const user = getAuthUser();
    if (!token || !user) {
      router.replace('/login');
    } else {
      router.replace('/console/settings');
    }
  }, [router]);
  return null;
}
