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

export default function FocusWidget() {
    const [blockedSites, setBlockedSites] = useState<FocusSite[]>(loadBlockedSitesFromStorage)
    const [siteInput, setSiteInput] = useState('')
    const [isFocusSessionActive, setIsFocusSessionActive] = useState(loadFocusSessionFromStorage)
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
        if (hasSyncedInitialState.current) return
        hasSyncedInitialState.current = true

        void syncSites(
            blockedSites.map((site) => site.domain),
            isFocusSessionActive ? 'BLOCK_SITE' : 'UNBLOCK_SITE'
        )
    }, [blockedSites, isFocusSessionActive])

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
                ? `${domain} is blocked right now.`
                : `${domain} will be blocked when you start focusing.`
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
        if (blockedSites.length === 0) {
            setHelperMessage('Add at least one distracting site before you start.')
            return
        }

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
        setHelperMessage(`Focus mode is on. ${blockedSites.length} site${blockedSites.length === 1 ? '' : 's'} blocked.`)
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
        setHelperMessage('Focus session ended. Your blocked sites are open again.')
        setIsSubmitting(false)
    }

    return (
        <section className="widget-panel focus-panel" aria-labelledby="focus-title">
            <header className="focus-hero">
                <h1 id="focus-title">Just Focus</h1>
                <p className="focus-description">
                    Turn on <span>Focus Mode</span> to block distracting websites and protect your momentum.
                </p>
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
                    disabled={isSubmitting || (!isFocusSessionActive && blockedSites.length === 0)}
                >
                    {isSubmitting ? 'Updating...' : isFocusSessionActive ? 'Stop focusing' : 'Start focusing'}
                </button>
            </div>
        </section>
    )
}
