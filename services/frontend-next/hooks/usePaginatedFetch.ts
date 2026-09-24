'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchPaginated } from '@/lib/api'

export function usePaginatedFetch<T>(apiPath: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const pathRef = useRef(apiPath)

  // Reset page when path changes
  if (pathRef.current !== apiPath) {
    pathRef.current = apiPath
    setPage(1)
    setSearch('')
  }

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(p))
      params.set('per_page', '20')
      if (q) params.set('q', q)

      const separator = pathRef.current.includes('?') ? '&' : '?'
      const result = await fetchPaginated<T>(`${pathRef.current}${separator}${params}`)
      setData(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch {
      setData([])
      setTotal(0)
      setTotalPages(1)
      setError('request_failed')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load(page, search)
  }, [page, search, load, apiPath])

  return {
    data, loading, error, page, total, totalPages, search,
    setSearch: (v: string) => { setSearch(v); setPage(1) },
    setPage, nextPage: () => setPage(p => Math.min(p + 1, totalPages)),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    reload: () => load(page, search),
  }
}
