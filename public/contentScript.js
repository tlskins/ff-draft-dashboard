const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const pauseForEl = async (selector, timeout = 30000) => {
  console.log('pausing for ', selector)
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector)
    if (el) return el
    await sleep(1000)
  }

  return null
}

var port = null

const pickHistoryMap = {}
const pickHistory = []

const handleListenDraftPicks = async () => {
  console.log('handleListenDraftPicks...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  port.onMessage.addListener((draftPicks) => {
    console.log('heard draft picks: ', draftPicks)
    pickHistory.push(...draftPicks)
    window.postMessage({ type: "FROM_EXT", draftPicks }, "*")
  })
}

const handleReadEspnDraft = async () => {
  console.log('handleReadEspnDraft...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  await pauseForEl('div[class="draft-columns"]')
  const draftHistoryList = document.querySelector('.draft-columns .draft-column:nth-child(3) ul')
  console.log('draftHistoryList', draftHistoryList)
  const draftPicks = []
  draftHistoryList?.querySelectorAll('li').forEach( draftPick => {
    const imgUrl = draftPick.querySelector('.player-headshot img:not(fallback)')?.getAttribute('src') || ''
    const name = draftPick.querySelector('.playerinfo__playername')?.textContent || ''
    const team = draftPick.querySelector('.playerinfo__playerteam')?.textContent || ''
    const position = draftPick.querySelector('.playerinfo__playerpos')?.textContent || ''
    const pick = draftPick.querySelector('.pick-info')?.textContent || ''

    if ( !pickHistoryMap[pick] ) {
      draftPicks.push({ imgUrl, name, team, position, pick })
      pickHistoryMap[pick] = true
    }
  })

  if ( draftPicks.length ) {
    console.log('sending draft picks', draftPicks)
    port?.postMessage(draftPicks)
  }
  // Schedule the next check after a certain interval
  setTimeout(handleReadEspnDraft, 1000) // Check every 1 seconds
}

const onMount = () => {
  const tabUrl = (document.location.href || "").toLowerCase()
  const isEspn = tabUrl.includes("fantasy.espn.com/football/draft")
  const isDashboard = tabUrl.includes("localhost") || tabUrl.includes("ff-draft-dashboard")

  if ( !isEspn && !isDashboard ) {
    console.log('not ff applicable site')
    return
  }

  // Connect to the extension's background script
  port = chrome.runtime.connect({ name: "ffDraftDashboard" })

  if (isEspn) {
    handleReadEspnDraft()
  } else {
    handleListenDraftPicks()
  }
}

onMount()
