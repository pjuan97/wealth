'use client'

import { useEffect, useState } from 'react'

// Matches the 767px breakpoint used by the CSS utilities in globals.css.
const MOBILE_QUERY = '(max-width: 767px)'

// Most responsive work in this app is done in CSS, which has no flash and no
// hydration mismatch. This hook is for the cases CSS genuinely cannot express:
// choosing a *different* number format, or rendering a different chart type,
// where the decision has to happen in JS before render.
//
// Returns false on the server and on first paint, then corrects after mount —
// so the desktop layout is always the SSR output and never mismatches.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mq.matches)
    update()
    // The media-query 'change' event covers the normal cases (rotating a
    // phone, dragging a desktop window across the breakpoint). A plain
    // 'resize' listener is a cheap fallback for environments that resize the
    // viewport without emitting the media-query event.
    mq.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return isMobile
}
