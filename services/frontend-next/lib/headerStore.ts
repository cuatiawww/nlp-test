import { create } from 'zustand'

interface HeaderState {
  title: string
  description: string
  lastUpdated: string
  sourceLabel: string
  sourceUrl: string
  setHeader: (data: {
    title: string
    description?: string
    lastUpdated?: string
    sourceLabel?: string
    sourceUrl?: string
  }) => void
  resetHeader: () => void
}

export const useHeaderStore = create<HeaderState>((set) => ({
  title: 'DASHBOARD EOC KRISIS KESEHATAN NASIONAL',
  description: '',
  lastUpdated: '',
  sourceLabel: '',
  sourceUrl: '',
  setHeader: (data) => set({
    title: data.title,
    description: data.description || '',
    lastUpdated: data.lastUpdated || '',
    sourceLabel: data.sourceLabel || '',
    sourceUrl: data.sourceUrl || '',
  }),
  resetHeader: () => set({
    title: 'DASHBOARD EOC KRISIS KESEHATAN NASIONAL',
    description: '',
    lastUpdated: '',
    sourceLabel: '',
    sourceUrl: '',
  }),
}))
