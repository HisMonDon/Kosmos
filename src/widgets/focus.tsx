import { useEffect, useRef, useState, type FormEvent } from 'react'
import './widgetPanel.css'
import './focus.css'

type FocusSite = {
    id: number
    domain: string
}

type BlockMessageType = 'BLOCK_SITE' | 'UNBLOCK_SITE'

type RuntimeResponse = {
    ok?: boolean
}

type ChromeRuntimeLike = {
    lastError?: { message?: string }
    sendMessage?: (message: { type: BlockMessageType; domain: string }, callback: (response?: RuntimeResponse) => void) => void
}

const BLOCKED_SITES_STORAGE_KEY = 'kosmos.blockedsites'
const FOCUS_SESSION_STORAGE_KEY = 'kosmos.focus-session-active'
const FOCUS_SESSION_STARTED_AT_KEY = 'kosmos.focus-session-started-at'

function createId(): number {
    return Date.now() + Math.floor(Math.random() * 10000)
}

function isFocusSitesArray(value: unknown): value is FocusSite[] {
    if (!Array.isArray(value)) return false

    return value.every((item) => {
        if (typeof item !== 'object' || item === null) return false

        const maybeSite = item as {
            id?: unknown
            domain?: unknown
            text?: unknown
        }

        const domain = typeof maybeSite.domain === 'string' ? maybeSite.domain : maybeSite.text

        return typeof maybeSite.id === 'number' && typeof domain === 'string'
    })
}

function loadBlockedSitesFromStorage(): FocusSite[] {
    try {
        const raw = window.localStorage.getItem(BLOCKED_SITES_STORAGE_KEY)
        if (!raw) return []

        const parsed: unknown = JSON.parse(raw)
        if (!isFocusSitesArray(parsed)) return []

        return parsed.map((site) => ({
            id: site.id,
            domain: ('domain' in site ? site.domain : '') || (site as { text?: string }).text || '',
        })).filter((site) => site.domain)
    } catch {
        return []
    }
}

function loadFocusSessionFromStorage(): boolean {
    try {
        return window.localStorage.getItem(FOCUS_SESSION_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

function loadFocusSessionStartedAt(): number | null {
    try {
        const raw = window.localStorage.getItem(FOCUS_SESSION_STARTED_AT_KEY)
        if (!raw) return null

        const parsed = Number(raw)
        return Number.isFinite(parsed) ? parsed : null
    } catch {
        return null
    }
}

function normalizeDomain(input: string): string | null {
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return null

    const withScheme = /^(https?:)?\/\//.test(trimmed) ? trimmed : `https://${trimmed}`

    try {
        const parsed = new URL(withScheme)
        const hostname = parsed.hostname.replace(/^www\./, '')
        return hostname || null
    } catch {
        return null
    }
}

async function sendBlockMessage(type: BlockMessageType, domain: string): Promise<boolean> {
    const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
    if (!runtime?.sendMessage) return false

    return new Promise((resolve) => {
        runtime.sendMessage?.({ type, domain }, (response) => {
            if (runtime.lastError) {
                resolve(false)
                return
            }

            resolve(Boolean(response?.ok))
        })
    })
}

async function syncSites(domains: string[], messageType: BlockMessageType): Promise<boolean> {
    if (domains.length === 0) return true
    const results = await Promise.all(domains.map((domain) => sendBlockMessage(messageType, domain)))
    return results.every(Boolean)
}

function formatFocusDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

type FocusWidgetProps = {
    onFocusSessionChange?: (isActive: boolean) => void
}

export default function FocusWidget({ onFocusSessionChange }: FocusWidgetProps) {
    const [blockedSites, setBlockedSites] = useState<FocusSite[]>(loadBlockedSitesFromStorage)
    const [siteInput, setSiteInput] = useState('')
    const [isFocusSessionActive, setIsFocusSessionActive] = useState(loadFocusSessionFromStorage)
    const [focusSessionStartedAt, setFocusSessionStartedAt] = useState<number | null>(loadFocusSessionStartedAt)
    const [elapsedFocusMs, setElapsedFocusMs] = useState(() => {
        const startedAt = loadFocusSessionStartedAt()
        return loadFocusSessionFromStorage() && startedAt !== null ? Math.max(0, Date.now() - startedAt) : 0
    })
    const [helperMessage, setHelperMessage] = useState('Turn on Focus Mode to block distracting websites.')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const hasSyncedInitialState = useRef(false)

    useEffect(() => {
        try {
            window.localStorage.setItem(BLOCKED_SITES_STORAGE_KEY, JSON.stringify(blockedSites))
        } catch {
            //
        }
    }, [blockedSites])

    useEffect(() => {
        try {
            window.localStorage.setItem(FOCUS_SESSION_STORAGE_KEY, String(isFocusSessionActive))
        } catch {
            //
        }
    }, [isFocusSessionActive])

    useEffect(() => {
        try {
            if (focusSessionStartedAt === null) {
                window.localStorage.removeItem(FOCUS_SESSION_STARTED_AT_KEY)
            } else {
                window.localStorage.setItem(FOCUS_SESSION_STARTED_AT_KEY, String(focusSessionStartedAt))
            }
        } catch {
            //
        }
    }, [focusSessionStartedAt])

    useEffect(() => {
        if (hasSyncedInitialState.current) return
        hasSyncedInitialState.current = true

        void syncSites(
            blockedSites.map((site) => site.domain),
            isFocusSessionActive ? 'BLOCK_SITE' : 'UNBLOCK_SITE'
        )
    }, [blockedSites, isFocusSessionActive])

    useEffect(() => {
        if (!isFocusSessionActive) {
            setElapsedFocusMs(0)
            return
        }

        if (focusSessionStartedAt === null) {
            const now = Date.now()
            setFocusSessionStartedAt(now)
            setElapsedFocusMs(0)
            return
        }

        setElapsedFocusMs(Math.max(0, Date.now() - focusSessionStartedAt))

        const intervalId = window.setInterval(() => {
            setElapsedFocusMs(Math.max(0, Date.now() - focusSessionStartedAt))
        }, 1000)

        return () => {
            window.clearInterval(intervalId)
        }
    }, [focusSessionStartedAt, isFocusSessionActive])

    async function addBlockedSite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const domain = normalizeDomain(siteInput)
        if (!domain) {
            setHelperMessage('Use a valid website like youtube.com or reddit.com.')
            return
        }

        const alreadyExists = blockedSites.some((blockedSite) => blockedSite.domain === domain)
        if (alreadyExists) {
            setSiteInput('')
            setHelperMessage(`${domain} is already on your list.`)
            return
        }

        setIsSubmitting(true)

        if (isFocusSessionActive) {
            const blocked = await sendBlockMessage('BLOCK_SITE', domain)
            if (!blocked) {
                setIsSubmitting(false)
                setHelperMessage('I could not update the blocker just now.')
                return
            }
        }

        setBlockedSites((current) => [{ id: createId(), domain }, ...current])
        setSiteInput('')
        setHelperMessage(
            isFocusSessionActive
                ? `${domain} and its pages are blocked right now.`
                : `${domain} and its pages will be blocked when you start focusing.`
        )
        setIsSubmitting(false)
    }

    async function removeBlockedSite(id: number) {
        const target = blockedSites.find((blockedSite) => blockedSite.id === id)
        if (!target) return

        setIsSubmitting(true)

        if (isFocusSessionActive) {
            const unblocked = await sendBlockMessage('UNBLOCK_SITE', target.domain)
            if (!unblocked) {
                setIsSubmitting(false)
                setHelperMessage(`I could not unblock ${target.domain} right now.`)
                return
            }
        }

        setBlockedSites((current) => current.filter((blockedSite) => blockedSite.id !== id))
        setHelperMessage(`${target.domain} was removed from your list.`)
        setIsSubmitting(false)
    }

    async function startFocusSession() {
        setIsSubmitting(true)
        const didBlockEverything = await syncSites(
            blockedSites.map((site) => site.domain),
            'BLOCK_SITE'
        )

        if (!didBlockEverything) {
            setHelperMessage('Some sites did not block correctly. Try again.')
            setIsSubmitting(false)
            return
        }

        setIsFocusSessionActive(true)
        setFocusSessionStartedAt(Date.now())
        setHelperMessage(`Focus mode is on. ${blockedSites.length} site${blockedSites.length === 1 ? '' : 's'} blocked.`)
        onFocusSessionChange?.(true)
        setIsSubmitting(false)
    }

    async function stopFocusSession() {
        setIsSubmitting(true)
        const didUnblockEverything = await syncSites(
            blockedSites.map((site) => site.domain),
            'UNBLOCK_SITE'
        )

        if (!didUnblockEverything) {
            setHelperMessage('I could not fully end the session. Try once more.')
            setIsSubmitting(false)
            return
        }

        setIsFocusSessionActive(false)
        setFocusSessionStartedAt(null)
        setElapsedFocusMs(0)
        setHelperMessage('Focus session ended. Your blocked sites are open again.')
        onFocusSessionChange?.(false)
        setIsSubmitting(false)
    }

    return (
        <section className="widget-panel focus-panel" aria-labelledby="focus-title">
            <header className="focus-hero">
                <h1 id="focus-title">Just Focus</h1>
                <p className="focus-description">
                    Turn on <span>Focus Mode</span> to block distracting websites and protect your momentum.
                </p>
                {isFocusSessionActive ? (
                    <div className="focus-timer is-active">
                        <span className="focus-timer-label">Time focused</span>
                        <strong>{formatFocusDuration(elapsedFocusMs)}</strong>
                    </div>
                ) : null}
            </header>

            <form className="focus-site-form" onSubmit={addBlockedSite}>
                <div className="focus-input-row">
                    <input
                        id="focus-site-input"
                        type="text"
                        value={siteInput}
                        onChange={(event) => setSiteInput(event.target.value)}
                        placeholder="URL you want to block..."
                        aria-label="Add website to block while focusing"
                        disabled={isSubmitting}
                    />
                    <button type="submit" className="btn-add focus-add-button" aria-label="Add blocked site" disabled={isSubmitting}>
                        +
                    </button>
                </div>
            </form>

            <div className="focus-meta" aria-live="polite">
                <p>{helperMessage}</p>
            </div>

            <section className="focus-list-section" aria-label="Blocked while focusing">
                <ul className="focus-sites-list">
                    {blockedSites.length === 0 ? (
                        <li className="empty-state focus-empty-state">
                            <p>No blocked sites yet</p>
                            <p className="empty-hint">Add the websites that usually pull you away.</p>
                        </li>
                    ) : (
                        blockedSites.map((blockedSite) => (
                            <li key={blockedSite.id} className="focus-site-item">
                                <button
                                    type="button"
                                    className="focus-remove-button"
                                    onClick={() => removeBlockedSite(blockedSite.id)}
                                    aria-label={`Remove ${blockedSite.domain} from blocked sites`}
                                    disabled={isSubmitting}
                                >
                                    -
                                </button>
                                <span className="focus-site-domain">{blockedSite.domain}</span>
                            </li>
                        ))
                    )}
                </ul>
            </section>

            <div className="focus-button-row">
                <button
                    type="button"
                    className={`focus-btn focus-session-button ${isFocusSessionActive ? 'is-ending' : ''}`}
                    onClick={isFocusSessionActive ? stopFocusSession : startFocusSession}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Updating...' : isFocusSessionActive ? 'Stop focusing' : 'Start focusing'}
                </button>
            </div>
        </section>
    )
}
