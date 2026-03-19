import { useEffect, useMemo, useState } from 'react'
import '../widgetPanel.css'

const STORAGE_KEY = 'siteTime'
const FLUSH_INTERVAL_MS = 2000
const CHART_COLORS = ['#8b46ff', '#5f93ff', '#00a39d', '#ff7a59', '#f2b133']
const DONUT_SIZE = 120
const DONUT_STROKE_WIDTH = 22
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

type SiteTimeByDomain = Record<string, number>
type StorageChange = {
    newValue?: unknown
}

type ExtensionApi = {
    chrome?: {
        runtime?: {
            sendMessage?: (message: { type: string }, callback?: () => void) => void
            lastError?: unknown
        }
        storage?: {
            local?: {
                get: (key: string) => Promise<Record<string, unknown>>
            }
            onChanged: {
                addListener: (callback: (changes: Record<string, StorageChange>, areaName: string) => void) => void
                removeListener: (callback: (changes: Record<string, StorageChange>, areaName: string) => void) => void
            }
        }
        tabs?: {
            create?: (options: { url: string }) => void
        }
    }
}

type ChartSlice = {
    label: string
    seconds: number
    ratio: number
    color: string
    startOffset: number
    dashLength: number
    midAngle: number
    href: string | null
    isAggregate: boolean
}

function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60

    if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`
    return `${remainingSeconds}s`
}

function describePercent(ratio: number): string {
    return `${Math.round(ratio * 100)}%`
}

function getSiteUrl(domain: string): string {
    const isLocalDomain =
        domain === 'localhost' ||
        domain.endsWith('.localhost') ||
        domain.includes(':') ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(domain)

    return `${isLocalDomain ? 'http' : 'https'}://${domain}`
}

function getTooltipPosition(midAngle: number) {
    const radians = ((midAngle - 90) * Math.PI) / 180
    const distanceFromCenter = 64

    return {
        left: `calc(50% + ${Math.cos(radians) * distanceFromCenter}px)`,
        top: `calc(50% + ${Math.sin(radians) * distanceFromCenter}px)`,
    }
}

export default function ScreenTimeWidget() {
    const [siteTime, setSiteTime] = useState<SiteTimeByDomain>({})
    const [activeSliceLabel, setActiveSliceLabel] = useState<string | null>(null)

    useEffect(() => {
        const extensionApi = (globalThis as ExtensionApi).chrome
        const storageLocal = extensionApi?.storage?.local
        const storageEvents = extensionApi?.storage?.onChanged
        const runtime = extensionApi?.runtime

        if (!storageLocal || !storageEvents) return

        const storageLocalApi = storageLocal
        const storageEventsApi = storageEvents

        let isMounted = true

        async function loadSiteTime() {
            const stored = await storageLocalApi.get(STORAGE_KEY)
            const raw = stored?.[STORAGE_KEY]
            if (!isMounted || !raw || typeof raw !== 'object') {
                if (isMounted && !raw) setSiteTime({})
                return
            }

            const next: SiteTimeByDomain = {}
            Object.entries(raw).forEach(([domain, value]) => {
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                    next[domain] = value
                }
            })
            setSiteTime(next)
        }

        const onStorageChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
            if (areaName !== 'local' || !changes[STORAGE_KEY]) return

            const changedValue = changes[STORAGE_KEY].newValue
            if (!changedValue || typeof changedValue !== 'object') {
                setSiteTime({})
                return
            }

            const next: SiteTimeByDomain = {}
            Object.entries(changedValue as Record<string, unknown>).forEach(([domain, value]) => {
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                    next[domain] = value
                }
            })
            setSiteTime(next)
        }

        void loadSiteTime()
        storageEventsApi.addListener(onStorageChanged)

        const flushTimer = window.setInterval(() => {
            if (!runtime?.sendMessage) return
            runtime.sendMessage({ type: 'FLUSH_SITE_TIME' }, () => {
                // Ignore runtime errors while popup is open/closing.
                void runtime.lastError
            })
        }, FLUSH_INTERVAL_MS)

        return () => {
            isMounted = false
            storageEventsApi.removeListener(onStorageChanged)
            window.clearInterval(flushTimer)
        }
    }, [])

    const sortedSites = useMemo(
        () => Object.entries(siteTime).sort((a, b) => b[1] - a[1]),
        [siteTime]
    )

    const totalSeconds = useMemo(
        () => sortedSites.reduce((sum, [, seconds]) => sum + seconds, 0),
        [sortedSites]
    )

    const chartSlices = useMemo<ChartSlice[]>(() => {
        if (totalSeconds <= 0 || sortedSites.length === 0) return []

        const topSites = sortedSites.slice(0, 4)
        const topTotal = topSites.reduce((sum, [, seconds]) => sum + seconds, 0)
        let strokeOffset = 0
        let angleCursor = 0

        const buildSlice = (
            label: string,
            seconds: number,
            color: string,
            href: string | null,
            isAggregate: boolean
        ): ChartSlice => {
            const ratio = seconds / totalSeconds
            const dashLength = ratio * DONUT_CIRCUMFERENCE
            const startAngle = angleCursor
            const endAngle = angleCursor + ratio * 360
            angleCursor = endAngle

            const nextSlice: ChartSlice = {
                label,
                seconds,
                ratio,
                color,
                startOffset: strokeOffset,
                dashLength,
                midAngle: startAngle + (endAngle - startAngle) / 2,
                href,
                isAggregate,
            }

            strokeOffset += dashLength
            return nextSlice
        }

        const slices: ChartSlice[] = topSites.map(([label, seconds], index) =>
            buildSlice(label, seconds, CHART_COLORS[index % CHART_COLORS.length], getSiteUrl(label), false)
        )

        if (sortedSites.length > 4) {
            slices.push(buildSlice('Other', totalSeconds - topTotal, CHART_COLORS[4], null, true))
        }

        return slices
    }, [sortedSites, totalSeconds])

    const topSite = sortedSites[0]
    const activeSlice = chartSlices.find((slice) => slice.label === activeSliceLabel) ?? null

    function openTrackedSite(slice: ChartSlice) {
        if (!slice.href) return

        const extensionApi = (globalThis as ExtensionApi).chrome

        if (extensionApi?.tabs?.create) {
            extensionApi.tabs.create({ url: slice.href })
            return
        }

        window.open(slice.href, '_blank', 'noopener,noreferrer')
    }

    return (
        <section className="widget-panel" aria-labelledby="screen-time-title">
            <div className="screen-time-scrollable">
                <h1 id="screen-time-title">Screen Time</h1>
                <p>Auto-tracked from your active browser tab while the extension is running.</p>

                <div className="screen-time-chart-wrap" aria-label="Screen time distribution">
                    <div
                        className="screen-time-donut"
                        role="img"
                        aria-label={`Tracked ${formatDuration(totalSeconds)} across ${sortedSites.length} site${sortedSites.length === 1 ? '' : 's'}`}
                    >
                        <svg
                            className="screen-time-donut-chart"
                            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
                            aria-hidden="true"
                        >
                            <circle
                                className="screen-time-donut-track"
                                cx={DONUT_SIZE / 2}
                                cy={DONUT_SIZE / 2}
                                r={DONUT_RADIUS}
                            />
                            {chartSlices.map((slice) => (
                                <circle
                                    key={slice.label}
                                    className={`screen-time-donut-slice${slice.isAggregate ? '' : ' is-clickable'}${activeSliceLabel === slice.label ? ' is-active' : ''}`}
                                    cx={DONUT_SIZE / 2}
                                    cy={DONUT_SIZE / 2}
                                    r={DONUT_RADIUS}
                                    fill="none"
                                    stroke={slice.color}
                                    strokeWidth={DONUT_STROKE_WIDTH}
                                    strokeDasharray={`${slice.dashLength} ${DONUT_CIRCUMFERENCE - slice.dashLength}`}
                                    strokeDashoffset={-slice.startOffset}
                                    onMouseEnter={() => setActiveSliceLabel(slice.label)}
                                    onMouseLeave={() => setActiveSliceLabel((current) => (current === slice.label ? null : current))}
                                    onFocus={() => setActiveSliceLabel(slice.label)}
                                    onBlur={() => setActiveSliceLabel((current) => (current === slice.label ? null : current))}
                                    onClick={() => openTrackedSite(slice)}
                                    onKeyDown={(event) => {
                                        if (slice.isAggregate) return
                                        if (event.key !== 'Enter' && event.key !== ' ') return

                                        event.preventDefault()
                                        openTrackedSite(slice)
                                    }}
                                    role={slice.isAggregate ? undefined : 'link'}
                                    tabIndex={slice.isAggregate ? -1 : 0}
                                    aria-label={
                                        slice.isAggregate
                                            ? `${slice.label}: ${formatDuration(slice.seconds)}`
                                            : `${slice.label}: ${formatDuration(slice.seconds)}. Open site.`
                                    }
                                />
                            ))}
                        </svg>

                        {activeSlice ? (
                            <div
                                className="screen-time-tooltip"
                                style={getTooltipPosition(activeSlice.midAngle)}
                                aria-live="polite"
                            >
                                <strong>{activeSlice.label}</strong>
                                <span>{formatDuration(activeSlice.seconds)}</span>
                                <span>{describePercent(activeSlice.ratio)}</span>
                            </div>
                        ) : null}

                        <div className="screen-time-donut-core">
                            <span className="screen-time-donut-title">Total</span>
                            <strong className="screen-time-donut-value">{formatDuration(totalSeconds)}</strong>
                        </div>
                    </div>

                    <div className="screen-time-legend" aria-label="Distribution legend">
                        {chartSlices.length === 0 ? (
                            <p className="panel-empty">No tracked activity yet.</p>
                        ) : (
                            chartSlices.map((slice) => (
                                <div
                                    key={slice.label}
                                    className={`screen-time-legend-row${activeSliceLabel === slice.label ? ' is-active' : ''}`}
                                >
                                    <span className="screen-time-legend-name">
                                        <span className="screen-time-legend-dot" style={{ backgroundColor: slice.color }} />
                                        {slice.label}
                                    </span>
                                    <span className="screen-time-legend-value">{describePercent(slice.ratio)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="panel-stat-grid" aria-label="Screen time metrics">
                    <article className="panel-stat">
                        <span className="panel-stat-label">Tracked</span>
                        <span className="panel-stat-value">{formatDuration(totalSeconds)}</span>
                    </article>
                    <article className="panel-stat">
                        <span className="panel-stat-label">Sites</span>
                        <span className="panel-stat-value">{sortedSites.length}</span>
                    </article>
                    <article className="panel-stat">
                        <span className="panel-stat-label">Top Site</span>
                        <span className="panel-stat-value">{topSite ? topSite[0] : '-'}</span>
                    </article>
                </div>

            </div>
        </section>
    )
}
