let lastDomain = null
let lastTs = Date.now()

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId)
    const domain = tab.url ? new URL(tab.url).hostname : null
    await commitElapsed()
    lastDomain = domain
    lastTs = Date.now()
})

async function commitElapsed() {
    if (!lastDomain) return
    const now = Date.now()
    const deltaSec = Math.max(0, Math.floor((now - lastTs) / 1000))
    if (!deltaSec) return

    const data = await chrome.storage.local.get('siteTime')
    const siteTime = data.siteTime ?? {}
    siteTime[lastDomain] = (siteTime[lastDomain] ?? 0) + deltaSec
    await chrome.storage.local.set({ siteTime })
}