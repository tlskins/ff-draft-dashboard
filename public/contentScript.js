console.log('content script start')

// helpers
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

// vars

var port = null

const mountTime = Date().toString()
const pickHistoryMap = {}
const pickHistory = []

// funcs

const handleListenDraftPicks = async () => {
  console.log('handleListenDraftPicks...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  port.onMessage.addListener((draftData) => {
    if ( draftData === true ) {
      // ack for keep alive
      console.log('ack from background for keep alive')
      window.postMessage({ type: "FROM_EXT", draftData }, "*")
    } else {
      // console.log('heard draft picks: ', draftData)
      pickHistory.push(...draftData.draftPicks)
      window.postMessage({ type: "FROM_EXT", draftData }, "*")
    }
  })

  handleListenKeepAlive()
}

const handleListenKeepAlive = () => {
  console.log('handleListenKeepAlive...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  port?.postMessage(true)

  setTimeout(handleListenKeepAlive, 5000) // check every 5 seconds
}

const handleReadEspnDraft = async () => {
  console.log('handleReadEspnDraft...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  await pauseForEl('div[class="draft-columns"]')
  const draftTitle = document.querySelector('h1.title').textContent
  const draftHistoryList = document.querySelector('.draft-columns .draft-column:nth-child(3) ul')
  console.log('draftHistoryList', draftHistoryList)
  const draftPicks = []
  draftHistoryList?.querySelectorAll('li')?.forEach( draftPick => {
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

  console.log('sending draft picks', draftPicks)
  port?.postMessage({
    draftPicks,
    draftTitle,
    platform: 'ESPN',
  })

  // Schedule the next check after a certain interval
  setTimeout(handleReadEspnDraft, 1000) // Check every 1 seconds
}

const handleReadNflDraft = async () => {
  console.log('handleReadNflDraft...', document.location.href)
  if ( port === null ) {
    console.log('port not initiated')
    return
  }

  await pauseForEl('div[data-testid="table"]')
  const draftHistoryList = document.querySelector('div[data-testid="table"]')
  console.log('draftHistoryList', draftHistoryList)
  const draftPicks = []
  draftHistoryList?.querySelectorAll('div[data-testid="tableRow"]')?.forEach( draftPick => {
    const avatarEl = draftPick.querySelector('div[data-testid="playerAvatar"]')
    // check if is a real draft pick instead of a header row
    if ( avatarEl ) {
      const cells = draftPick.querySelectorAll('div[data-testid="tableCell"]')
      const pick = parseInt(cells[1]?.textContent || '') || 0
      const divComponents = cells[2].querySelectorAll('button > div > div')
      const name = divComponents[1].textContent
      const teamAndPos = divComponents[2].textContent.split(' - ')
      const team = teamAndPos[0]
      const position = teamAndPos[1]
  
      if ( !pickHistoryMap[pick] ) {
        draftPicks.push({ name, team, position, pick })
        pickHistoryMap[pick] = true
      }
    }
  })

  console.log('sending draft picks', draftPicks)
  port?.postMessage({
    draftPicks,
    draftTitle: `NFL.com ${ mountTime }`,
    platform: 'NFL',
  })

  // Schedule the next check after a certain interval
  setTimeout(handleReadNflDraft, 1000) // Check every 1 seconds
}


const onMount = () => {
  console.log('onmount content script')
  const tabUrl = (document.location.href || "").toLowerCase()
  const isEspn = tabUrl.includes("fantasy.espn.com/football/draft")
  const isNfl = tabUrl.includes("fantasy.nfl.com/draftclient")
  const isDashboard = tabUrl.includes("localhost") || tabUrl.includes("ff-draft-dashboard")

  if ( !isEspn && !isDashboard && !isNfl ) {
    console.log('not ff applicable site')
    return
  }

  // Connect to the extension's background script
  port = chrome.runtime.connect({ name: "ffDraftDashboard" })

  if (isEspn) {
    handleReadEspnDraft()
  } else if (isNfl) {
    handleReadNflDraft()
  } else {
    handleListenDraftPicks()
  }
}

onMount()
