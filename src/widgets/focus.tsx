import { useEffect, useState } from 'react'
import './widgetPanel.css'
type Focus = {
    id: number
    text: string
    done: boolean
    recurringOrigin?: {
        recurringId: number
        occurrenceDate: string
    }
}
const FOCUS_STORAGE_KEY = 'kosmos.focussites'
function loadBlockedSitesFromStorage(): Focus[] {
    try {
        const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        return isBlockedSitesArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function isBlockedSitesArray(value: unknown): value is Focus[] {
    if (!Array.isArray(value)) return false
    return value.every((item) => {
        if (typeof item !== 'object' || item === null) return false
        const maybeBlockedSite = item as {
            id?: unknown
            text?: unknown
            done?: unknown
            recurringOrigin?: unknown
        }
        const hasCoreFields = (
            typeof maybeBlockedSite.id === 'number' &&
            typeof maybeBlockedSite.text === 'string' &&
            typeof maybeBlockedSite.done === 'boolean'
        )

        if (!hasCoreFields) return false
        if (typeof maybeBlockedSite.recurringOrigin === 'undefined') return true
        if (typeof maybeBlockedSite.recurringOrigin !== 'object' || maybeBlockedSite.recurringOrigin === null) {
            return false
        }

        const recurringOrigin = maybeBlockedSite.recurringOrigin as {
            recurringId?: unknown
            occurrenceDate?: unknown
        }

        return (
            typeof recurringOrigin.recurringId === 'number' &&
            typeof recurringOrigin.occurrenceDate === 'string'
        )
    })
}

export default function FocusWidget() {
    const [blockedSites, setBlockedSites] = useState<Focus[]>(() => loadBlockedSitesFromStorage())

    useEffect(() => {
        window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(blockedSites))
    }, [blockedSites])

    const toggleBlockedSite = (id: number) => {
        setBlockedSites((current) =>
            current.map((blockedSite) =>
                blockedSite.id === id ? { ...blockedSite, done: !blockedSite.done } : blockedSite
            )
        )
    }

    const removeBlockedSite = (id: number) => {
        setBlockedSites((current) => current.filter((blockedSite) => blockedSite.id !== id))
    }

    return (
        <section className="widget-panel" aria-labelledby="focus-title">
            <div className="focus-header-row">
                <h1 id="focus-title">Focus</h1>
            </div>
            <div className="blocked-sites-section">
                <ul className="blocked-sites-list">
                    {blockedSites.length === 0 ? (
                        <li className="empty-state">
                            <p>No tasks yet</p>
                            <p className="empty-hint">Add one to get started</p>
                        </li>
                    ) : (
                        blockedSites.map((blockedSite) => (
                            <li key={blockedSite.id} className={`blocked-sites-item ${blockedSite.done ? 'done' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={blockedSite.done}
                                    onChange={() => toggleBlockedSite(blockedSite.id)}
                                    aria-label={`Mark ${blockedSite.text} as done`}
                                    className="blocked-sites-checkbox"
                                />
                                <span className="blocked-sites-text">{blockedSite.text}</span>
                                <button
                                    type="button"
                                    className="btn-delete"
                                    onClick={() => removeBlockedSite(blockedSite.id)}
                                    aria-label="Delete task"
                                >
                                    ×
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </section>
    )
}
