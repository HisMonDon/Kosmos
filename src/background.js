const STORAGE_KEY = 'siteTime'
const TRACKING_ALARM = 'track-site-time'

let lastDomain = null
let lastTs = Date.now()

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

async function commitElapsed() {
    if (!lastDomain) {
        lastTs = Date.now()
        return
    }

    const now = Date.now()
    const deltaSec = Math.max(0, Math.floor((now - lastTs) / 1000))
    lastTs = now

    if (!deltaSec) return

    const data = await chrome.storage.local.get(STORAGE_KEY)
    const siteTime = data[STORAGE_KEY] ?? {}
    siteTime[lastDomain] = (siteTime[lastDomain] ?? 0) + deltaSec
    await chrome.storage.local.set({ [STORAGE_KEY]: siteTime })
}

async function switchToDomain(nextDomain) {
    await commitElapsed()
    lastDomain = nextDomain
}

async function refreshActiveDomain() {
    const activeDomain = await getCurrentActiveDomain()
    await switchToDomain(activeDomain)
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: 1 })
})

chrome.runtime.onStartup.addListener(async () => {
    chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: 1 })
    await refreshActiveDomain()
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
})

chrome.runtime.onSuspend.addListener(() => {
    void commitElapsed()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'FLUSH_SITE_TIME') return undefined

        ; (async () => {
            await commitElapsed()

            if (sender.tab?.id) {
                const tab = await chrome.tabs.get(sender.tab.id)
                lastDomain = getDomainFromUrl(tab.url)
            } else {
                const activeDomain = await getCurrentActiveDomain()
                lastDomain = activeDomain
            }

            sendResponse({ ok: true })
        })().catch(() => {
            sendResponse({ ok: false })
        })

    return true
})

void refreshActiveDomain()