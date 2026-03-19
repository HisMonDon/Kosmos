import { useEffect, useMemo, useState } from 'react'
import '../widgetPanel.css'

const STORAGE_KEY = 'siteTime'
const FLUSH_INTERVAL_MS = 2000
const CHART_COLORS = ['#8b46ff', '#5f93ff', '#00a39d', '#ff7a59', '#f2b133']

type SiteTimeByDomain = Record<string, number>
type ChartSlice = {
    label: string
    seconds: number
    ratio: number
    color: string
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

export default function ScreenTimeWidget() {
    const [siteTime, setSiteTime] = useState<SiteTimeByDomain>({})

    useEffect(() => {
        const extensionApi = (globalThis as { chrome?: any }).chrome
        if (!extensionApi?.storage?.local) return

        let isMounted = true

        async function loadSiteTime() {
            const stored = await extensionApi.storage.local.get(STORAGE_KEY)
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
        extensionApi.storage.onChanged.addListener(onStorageChanged)

        const flushTimer = window.setInterval(() => {
            if (!extensionApi.runtime?.sendMessage) return
            extensionApi.runtime.sendMessage({ type: 'FLUSH_SITE_TIME' }, () => {
                // Ignore runtime errors while popup is open/closing.
                void extensionApi.runtime?.lastError
            })
        }, FLUSH_INTERVAL_MS)

        return () => {
            isMounted = false
            extensionApi.storage.onChanged.removeListener(onStorageChanged)
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
        const slices: ChartSlice[] = topSites.map(([label, seconds], index) => ({
            label,
            seconds,
            ratio: seconds / totalSeconds,
            color: CHART_COLORS[index % CHART_COLORS.length],
        }))

        if (sortedSites.length > 4) {
            slices.push({
                label: 'Other',
                seconds: totalSeconds - topTotal,
                ratio: (totalSeconds - topTotal) / totalSeconds,
                color: CHART_COLORS[4],
            })
        }

        return slices
    }, [sortedSites, totalSeconds])

    const chartConicBackground = useMemo(() => {
        if (chartSlices.length === 0) {
            return 'conic-gradient(color-mix(in srgb, var(--accent) 12%, var(--border)) 0deg 360deg)'
        }

        let cursor = 0
        const stops = chartSlices.map((slice) => {
            const start = cursor
            const end = cursor + slice.ratio * 360
            cursor = end
            return `${slice.color} ${start}deg ${end}deg`
        })

        return `conic-gradient(${stops.join(', ')})`
    }, [chartSlices])

    const topSite = sortedSites[0]

    return (
        <section className="widget-panel widget-panel-scrollable" aria-labelledby="screen-time-title">
            <h1 id="screen-time-title">Screen Time</h1>
            <p>Auto-tracked from your active browser tab while the extension is running.</p>

            <div className="screen-time-chart-wrap" aria-label="Screen time distribution">
                <div
                    className="screen-time-donut"
                    role="img"
                    aria-label={`Tracked ${formatDuration(totalSeconds)} across ${sortedSites.length} site${sortedSites.length === 1 ? '' : 's'}`}
                    style={{ backgroundImage: chartConicBackground }}
                >
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
                            <div key={slice.label} className="screen-time-legend-row">
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

            <div className="panel-list" aria-label="Tracked sites">
                {sortedSites.length === 0 ? (
                    <p className="panel-empty">No tracked activity yet. Browse websites with the extension enabled.</p>
                ) : (
                    sortedSites.slice(0, 6).map(([domain, seconds]) => (
                        <div key={domain} className="panel-row">
                            <span className="panel-row-domain">{domain}</span>
                            <span className="panel-row-time">{formatDuration(seconds)}</span>
                        </div>
                    ))
                )}
            </div>
        </section>
    )
}
