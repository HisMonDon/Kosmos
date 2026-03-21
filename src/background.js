const DAILY_STORAGE_KEY = 'siteTimeDaily'
const MONTHLY_STORAGE_KEY = 'siteTimeMonthly'
const TRACKING_ALARM = 'track-site-time'
const BLOCKED_SITES_STORAGE_KEY = 'blockedSites'

let lastDomain = null
let lastTs = Date.now()

function normalizeDomain(input) {
    if (typeof input !== 'string') return null
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return null

    const withScheme = /^(https?:)?\/\//.test(trimmed) ? trimmed : `https://${trimmed}`

    try {
        const parsedUrl = new URL(withScheme)
        const hostname = parsedUrl.hostname.replace(/^www\./, '')
        return hostname || null
    } catch {
        return null
    }
}

function buildBlockRule(domain, id) {
    return {
        id,
        priority: 1,
        action: { type: 'block' },
        condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: ['main_frame', 'sub_frame'],
        },
    }
}

function doesDomainMatchBlockedSite(domain, blockedDomain) {
    const normalizedDomain = normalizeDomain(domain)
    if (!normalizedDomain || !blockedDomain) return false

    return normalizedDomain === blockedDomain || normalizedDomain.endsWith(`.${blockedDomain}`)
}

async function getBlockedSites() {
    const stored = await chrome.storage.local.get(BLOCKED_SITES_STORAGE_KEY)
    const rawSites = stored[BLOCKED_SITES_STORAGE_KEY]
    if (!Array.isArray(rawSites)) return []

    return rawSites
        .map((site) => normalizeDomain(site))
        .filter((site, index, list) => Boolean(site) && list.indexOf(site) === index)
}

async function refreshBlockedTabs(blockedSites) {
    if (!Array.isArray(blockedSites) || blockedSites.length === 0) return

    const tabs = await chrome.tabs.query({})

    await Promise.all(
        tabs.map(async (tab) => {
            if (typeof tab.id !== 'number') return

            const tabDomain = getDomainFromUrl(tab.url)
            if (!tabDomain) return

            const shouldReload = blockedSites.some((blockedDomain) =>
                doesDomainMatchBlockedSite(tabDomain, blockedDomain)
            )

            if (!shouldReload) return

            try {
                await chrome.tabs.reload(tab.id)
            } catch {
            }
        })
    )
}

async function syncBlockRulesFromStorage() {
    const blockedSites = await getBlockedSites()
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
    const nextRules = blockedSites.map((domain, index) => buildBlockRule(domain, index + 1))

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRules.map((rule) => rule.id),
        addRules: nextRules,
    })
}

async function addBlockedSite(domain) {
    const normalizedDomain = normalizeDomain(domain)
    if (!normalizedDomain) return { ok: false, error: 'Invalid domain' }

    const blockedSites = await getBlockedSites()
    if (!blockedSites.includes(normalizedDomain)) {
        blockedSites.push(normalizedDomain)
        await chrome.storage.local.set({ [BLOCKED_SITES_STORAGE_KEY]: blockedSites })
        await syncBlockRulesFromStorage()
        await refreshBlockedTabs([normalizedDomain])
    }

    return { ok: true, domain: normalizedDomain }
}

async function removeBlockedSite(domain) {
    const normalizedDomain = normalizeDomain(domain)
    if (!normalizedDomain) return { ok: false, error: 'Invalid domain' }

    const blockedSites = await getBlockedSites()
    const nextBlockedSites = blockedSites.filter((site) => site !== normalizedDomain)

    await chrome.storage.local.set({ [BLOCKED_SITES_STORAGE_KEY]: nextBlockedSites })
    await syncBlockRulesFromStorage()

    return { ok: true, domain: normalizedDomain }
}

async function ensureTrackingAlarm() {
    const existingAlarm = await chrome.alarms.get(TRACKING_ALARM)
    if (!existingAlarm) {
        chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: 1 })
    }
}

function getDomainFromUrl(url) {
    if (!url) return null

    try {
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return null
        }
        return parsedUrl.hostname
    } catch {
        return null
    }
}

async function getCurrentActiveDomain() {
    try {
        const focusedWindow = await chrome.windows.getLastFocused({
            populate: true,
            windowTypes: ['normal'],
        })
        const focusedTab = focusedWindow?.tabs?.find((tab) => tab.active)
        const focusedDomain = getDomainFromUrl(focusedTab?.url)
        if (focusedDomain) {
            return focusedDomain
        }
    } catch {
    }

    const tabs = await chrome.tabs.query({ active: true, windowType: 'normal' })
    for (const tab of tabs) {
        const domain = getDomainFromUrl(tab.url)
        if (domain) {
            return domain
        }
    }

    return null
}

function getDayKey(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getMonthKey(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

function normalizeHistory(rawHistory) {
    if (!rawHistory || typeof rawHistory !== 'object') {
        return {}
    }

    const normalizedHistory = {}

    Object.entries(rawHistory).forEach(([periodKey, periodValue]) => {
        if (!periodValue || typeof periodValue !== 'object') {
            return
        }

        const normalizedPeriod = {}

        Object.entries(periodValue).forEach(([domain, durationMs]) => {
            if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
                normalizedPeriod[domain] = durationMs
            }
        })

        if (Object.keys(normalizedPeriod).length > 0) {
            normalizedHistory[periodKey] = normalizedPeriod
        }
    })

    return normalizedHistory
}

function addDurationToBucket(history, periodKey, domain, durationMs) {
    if (!history[periodKey]) {
        history[periodKey] = {}
    }

    history[periodKey][domain] = (history[periodKey][domain] ?? 0) + durationMs
}

async function recordTrackedTime(domain, startedAtMs, endedAtMs) {
    if (!domain || endedAtMs <= startedAtMs) return

    const stored = await chrome.storage.local.get([DAILY_STORAGE_KEY, MONTHLY_STORAGE_KEY])
    const dailyHistory = normalizeHistory(stored[DAILY_STORAGE_KEY])
    const monthlyHistory = normalizeHistory(stored[MONTHLY_STORAGE_KEY])

    let cursor = startedAtMs

    while (cursor < endedAtMs) {
        const currentDate = new Date(cursor)
        const nextDayBoundary = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate() + 1
        ).getTime()
        const segmentEnd = Math.min(endedAtMs, nextDayBoundary)
        const durationMs = segmentEnd - cursor

        if (durationMs > 0) {
            addDurationToBucket(dailyHistory, getDayKey(currentDate), domain, durationMs)
            addDurationToBucket(monthlyHistory, getMonthKey(currentDate), domain, durationMs)
        }

        cursor = segmentEnd
    }

    await chrome.storage.local.set({
        [DAILY_STORAGE_KEY]: dailyHistory,
        [MONTHLY_STORAGE_KEY]: monthlyHistory,
    })
}

async function commitElapsed() {
    const now = Date.now()
    const startedAtMs = lastTs
    lastTs = now

    if (!lastDomain) {
        return
    }

    await recordTrackedTime(lastDomain, startedAtMs, now)
}

async function switchToDomain(nextDomain) {
    await commitElapsed()
    lastDomain = nextDomain
    lastTs = Date.now()
}

async function refreshActiveDomain() {
    const activeDomain = await getCurrentActiveDomain()
    await switchToDomain(activeDomain)
}

chrome.runtime.onInstalled.addListener(() => {
    void ensureTrackingAlarm()
    void syncBlockRulesFromStorage()
})

chrome.runtime.onStartup.addListener(async () => {
    await ensureTrackingAlarm()
    await refreshActiveDomain()
    await syncBlockRulesFromStorage()
    await refreshBlockedTabs(await getBlockedSites())
})

chrome.tabs.onActivated.addListener(async () => {
    await refreshActiveDomain()
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!tab.active) return
    if (!('url' in changeInfo) && changeInfo.status !== 'complete') return

    const nextDomain = getDomainFromUrl(tab.url)
    if (nextDomain !== lastDomain) {
        await switchToDomain(nextDomain)
    }
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await switchToDomain(null)
        return
    }

    await refreshActiveDomain()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== TRACKING_ALARM) return

    await commitElapsed()

    const activeDomain = await getCurrentActiveDomain()
    lastDomain = activeDomain
    lastTs = Date.now()
})

chrome.runtime.onSuspend.addListener(() => {
    void commitElapsed()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'FLUSH_SITE_TIME') {
        ; (async () => {
            await commitElapsed()

            if (sender.tab?.id) {
                const tab = await chrome.tabs.get(sender.tab.id)
                lastDomain = getDomainFromUrl(tab.url)
            } else {
                const activeDomain = await getCurrentActiveDomain()
                lastDomain = activeDomain
            }

            lastTs = Date.now()

            sendResponse({ ok: true })
        })().catch(() => {
            sendResponse({ ok: false })
        })

        return true
    }

    if (message?.type === 'BLOCK_SITE') {
        ; (async () => {
            const result = await addBlockedSite(message?.domain)
            sendResponse(result)
        })().catch(() => {
            sendResponse({ ok: false })
        })

        return true
    }

    if (message?.type === 'UNBLOCK_SITE') {
        ; (async () => {
            const result = await removeBlockedSite(message?.domain)
            sendResponse(result)
        })().catch(() => {
            sendResponse({ ok: false })
        })

        return true
    }

    return undefined
})

void refreshActiveDomain()
void ensureTrackingAlarm()
