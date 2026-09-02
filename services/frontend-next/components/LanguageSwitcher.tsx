'use client'

import React from "react"

interface LanguageSwitcherProps {
  compact?: boolean
  variant?: "light" | "dark" | "pill"
  className?: string
}

export default function LanguageSwitcher(_props: LanguageSwitcherProps) {
  // Temporarily hidden per user request (Default to English)
  return null;
}
