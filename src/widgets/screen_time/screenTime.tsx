import { useEffect, useMemo, useState } from 'react'
import '../widgetPanel.css'

const DAILY_STORAGE_KEY = 'siteTimeDaily'
const MONTHLY_STORAGE_KEY = 'siteTimeMonthly'
const FLUSH_INTERVAL_MS = 2000
const CHART_COLORS = ['#8b46ff', '#5f93ff', '#00a39d', '#ff7a59', '#f2b133']
const DONUT_SIZE = 120
const DONUT_STROKE_WIDTH = 22
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

type TimeRange = 'daily' | 'monthly'
type SiteTimeByDomain = Record<string, number>
type SiteTimeHistory = Record<string, SiteTimeByDomain>
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
                get: (keys: string | string[]) => Promise<Record<string, unknown>>
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

type LegendEntry = {
    label: string
    durationMs: number
    ratio: number
    color: string
    href: string
    chartLabel: string
}

type ChartSlice = {
    label: string
    durationMs: number
    ratio: number
    color: string
    startOffset: number
    dashLength: number
    midAngle: number
    href: string | null
    isAggregate: boolean
}

function formatDuration(totalDurationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(totalDurationMs / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainingSeconds = totalSeconds % 60

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

function getDayKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getMonthKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

function normalizeHistory(rawHistory: unknown): SiteTimeHistory {
    if (!rawHistory || typeof rawHistory !== 'object') {
        return {}
    }

    const nextHistory: SiteTimeHistory = {}

    Object.entries(rawHistory as Record<string, unknown>).forEach(([periodKey, periodValue]) => {
        if (!periodValue || typeof periodValue !== 'object') {
            return
        }

        const nextPeriod: SiteTimeByDomain = {}

        Object.entries(periodValue as Record<string, unknown>).forEach(([domain, durationMs]) => {
            if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
                nextPeriod[domain] = durationMs
            }
        })

        if (Object.keys(nextPeriod).length > 0) {
            nextHistory[periodKey] = nextPeriod
        }
    })

    return nextHistory
}

function getCurrentPeriodKey(range: TimeRange): string {
    const now = new Date()
    return range === 'daily' ? getDayKey(now) : getMonthKey(now)
}

export default function ScreenTimeWidget() {
    const [dailyHistory, setDailyHistory] = useState<SiteTimeHistory>({})
    const [monthlyHistory, setMonthlyHistory] = useState<SiteTimeHistory>({})
    const [selectedRange, setSelectedRange] = useState<TimeRange>('daily')
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

        async function loadTrackingHistory() {
            const stored = await storageLocalApi.get([DAILY_STORAGE_KEY, MONTHLY_STORAGE_KEY])
            if (!isMounted) return

            setDailyHistory(normalizeHistory(stored[DAILY_STORAGE_KEY]))
            setMonthlyHistory(normalizeHistory(stored[MONTHLY_STORAGE_KEY]))
        }

        const onStorageChanged = (changes: Record<string, StorageChange>, areaName: string) => {
            if (areaName !== 'local') return

            if (DAILY_STORAGE_KEY in changes) {
                setDailyHistory(normalizeHistory(changes[DAILY_STORAGE_KEY]?.newValue))
            }

            if (MONTHLY_STORAGE_KEY in changes) {
                setMonthlyHistory(normalizeHistory(changes[MONTHLY_STORAGE_KEY]?.newValue))
            }
        }

        void loadTrackingHistory()
        storageEventsApi.addListener(onStorageChanged)

        const flushTimer = window.setInterval(() => {
            if (!runtime?.sendMessage) return
            runtime.sendMessage({ type: 'FLUSH_SITE_TIME' }, () => {
                void runtime.lastError
            })
        }, FLUSH_INTERVAL_MS)

        return () => {
            isMounted = false
            storageEventsApi.removeListener(onStorageChanged)
            window.clearInterval(flushTimer)
        }
    }, [])

    const currentPeriodKey = getCurrentPeriodKey(selectedRange)
    const siteTime = useMemo(
        () => (selectedRange === 'daily' ? dailyHistory[currentPeriodKey] : monthlyHistory[currentPeriodKey]) ?? {},
        [currentPeriodKey, dailyHistory, monthlyHistory, selectedRange]
    )

    const sortedSites = useMemo(
        () => Object.entries(siteTime).sort((a, b) => b[1] - a[1]),
        [siteTime]
    )

    const totalDurationMs = useMemo(
        () => sortedSites.reduce((sum, [, durationMs]) => sum + durationMs, 0),
        [sortedSites]
    )

    const chartSlices = useMemo<ChartSlice[]>(() => {
        if (totalDurationMs <= 0 || sortedSites.length === 0) return []

        const topSites = sortedSites.slice(0, 4)
        const topTotal = topSites.reduce((sum, [, durationMs]) => sum + durationMs, 0)
        let strokeOffset = 0
        let angleCursor = 0

        const buildSlice = (
            label: string,
            durationMs: number,
            color: string,
            href: string | null,
            isAggregate: boolean
        ): ChartSlice => {
            const ratio = durationMs / totalDurationMs
            const dashLength = ratio * DONUT_CIRCUMFERENCE
            const startAngle = angleCursor
            const endAngle = angleCursor + ratio * 360
            angleCursor = endAngle

            const nextSlice: ChartSlice = {
                label,
                durationMs,
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

        const slices: ChartSlice[] = topSites.map(([label, durationMs], index) =>
            buildSlice(label, durationMs, CHART_COLORS[index % CHART_COLORS.length], getSiteUrl(label), false)
        )

        if (sortedSites.length > 4) {
            slices.push(buildSlice('Other', totalDurationMs - topTotal, CHART_COLORS[4], null, true))
        }

        return slices
    }, [sortedSites, totalDurationMs])

    const legendEntries = useMemo<LegendEntry[]>(() => {
        if (totalDurationMs <= 0) return []

        return sortedSites.map(([label, durationMs], index) => ({
            label,
            durationMs,
            ratio: durationMs / totalDurationMs,
            color: CHART_COLORS[Math.min(index, CHART_COLORS.length - 1)],
            href: getSiteUrl(label),
            chartLabel: index < 4 ? label : 'Other',
        }))
    }, [sortedSites, totalDurationMs])

    const topSite = sortedSites[0]
    const activeSlice = chartSlices.find((slice) => slice.label === activeSliceLabel) ?? null

    function openSite(url: string) {
        const extensionApi = (globalThis as ExtensionApi).chrome

        if (extensionApi?.tabs?.create) {
            extensionApi.tabs.create({ url })
            return
        }

        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const periodCopy =
        selectedRange === 'daily'
            ? 'Today only. Includes all tracked browsing time.'
            : 'This month so far. Includes all tracked browsing time.'

    return (
        <section className="widget-panel" aria-labelledby="screen-time-title">
            <div className="screen-time-scrollable">
                <div className="screen-time-header">
                    <div>
                        <h1 id="screen-time-title">Screen Time</h1>
                        <p>{periodCopy}</p>
                    </div>

                    <div className="screen-time-tabs" role="tablist" aria-label="Screen time range">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selectedRange === 'daily'}
                            className={`screen-time-tab${selectedRange === 'daily' ? ' is-active' : ''}`}
                            onClick={() => setSelectedRange('daily')}
                        >
                            Daily
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selectedRange === 'monthly'}
                            className={`screen-time-tab${selectedRange === 'monthly' ? ' is-active' : ''}`}
                            onClick={() => setSelectedRange('monthly')}
                        >
                            Monthly
                        </button>
                    </div>
                </div>

                <div className="screen-time-chart-wrap" aria-label="Screen time distribution">
                    <div
                        className="screen-time-donut"
                        role="img"
                        aria-label={`Tracked ${formatDuration(totalDurationMs)} across ${sortedSites.length} site${sortedSites.length === 1 ? '' : 's'}`}
                    >
                        <svg
                            className="screen-time-donut-chart"
                            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
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
                                    onClick={() => {
                                        if (slice.href) openSite(slice.href)
                                    }}
                                    onKeyDown={(event) => {
                                        if (slice.isAggregate) return
                                        if (event.key !== 'Enter' && event.key !== ' ') return

                                        event.preventDefault()
                                        if (slice.href) openSite(slice.href)
                                    }}
                                    role={slice.isAggregate ? undefined : 'link'}
                                    tabIndex={slice.isAggregate ? -1 : 0}
                                    aria-label={
                                        slice.isAggregate
                                            ? `${slice.label}: ${formatDuration(slice.durationMs)}`
                                            : `${slice.label}: ${formatDuration(slice.durationMs)}. Open site.`
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
                                <span>{formatDuration(activeSlice.durationMs)}</span>
                                <span>{describePercent(activeSlice.ratio)}</span>
                            </div>
                        ) : null}

                        <div className="screen-time-donut-core">
                            <span className="screen-time-donut-title">{selectedRange === 'daily' ? 'Today' : 'Month'}</span>
                            <strong className="screen-time-donut-value">{formatDuration(totalDurationMs)}</strong>
                        </div>
                    </div>

                    <div className="screen-time-legend" aria-label="Tracked sites">
                        {legendEntries.length === 0 ? (
                            <p className="panel-empty">No tracked activity yet.</p>
                        ) : (
                            legendEntries.map((entry) => (
                                <div
                                    key={entry.label}
                                    className={`screen-time-legend-row${activeSliceLabel === entry.chartLabel ? ' is-active' : ''}`}
                                >
                                    <span className="screen-time-legend-name">
                                        <span className="screen-time-legend-dot" style={{ backgroundColor: entry.color }} />
                                        {entry.label}
                                    </span>
                                    <button
                                        type="button"
                                        className="screen-time-legend-link"
                                        onClick={() => openSite(entry.href)}
                                        aria-label={`Open ${entry.label}`}
                                    >
                                        {describePercent(entry.ratio)}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="panel-stat-grid" aria-label="Screen time metrics">
                    <article className="panel-stat">
                        <span className="panel-stat-label">Tracked</span>
                        <span className="panel-stat-value">{formatDuration(totalDurationMs)}</span>
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
