const DAILY_STORAGE_KEY = 'siteTimeDaily'
const MONTHLY_STORAGE_KEY = 'siteTimeMonthly'
const TRACKING_ALARM = 'track-site-time'
const IDLE_DETECTION_SECONDS = 60

let lastDomain = null
let lastTs = Date.now()
let isUserActive = true

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
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    return getDomainFromUrl(tabs[0]?.url)
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

    if (!lastDomain || !isUserActive) {
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

async function pauseTracking() {
    await commitElapsed()
    isUserActive = false
    lastTs = Date.now()
}

async function resumeTracking() {
    isUserActive = true
    lastTs = Date.now()
    await refreshActiveDomain()
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: 1 })
    chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS)
})

chrome.runtime.onStartup.addListener(async () => {
    chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: 1 })
    chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS)

    const idleState = await chrome.idle.queryState(IDLE_DETECTION_SECONDS)
    isUserActive = idleState === 'active'

    if (isUserActive) {
        await refreshActiveDomain()
    } else {
        lastDomain = null
        lastTs = Date.now()
    }
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

    if (!isUserActive) {
        lastDomain = null
        return
    }

    const activeDomain = await getCurrentActiveDomain()
    lastDomain = activeDomain
    lastTs = Date.now()
})

chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === 'active') {
        await resumeTracking()
        return
    }

    await pauseTracking()
    lastDomain = null
})

chrome.runtime.onSuspend.addListener(() => {
    void commitElapsed()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'FLUSH_SITE_TIME') return undefined

        ; (async () => {
            await commitElapsed()

            if (!isUserActive) {
                lastDomain = null
            } else if (sender.tab?.id) {
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
})

void refreshActiveDomain()
