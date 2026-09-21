'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function UsersRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/users')
  }, [router])
  return (
    <div className="p-8 text-center text-slate-400 text-sm">
      Redirecting to User Management in Console...
    </div>
  )
}
