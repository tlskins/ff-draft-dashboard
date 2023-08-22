console.log('starting event listener')

let eventListenerActive = true

chrome.runtime.onConnect.addListener(handleConnection)

// App logic

function handleIncomingDraftPicks(draftEventData) {
  // Handle the message
  if ( draftDashPort ) {
    console.log("Outgoing draft picks to port")
    draftDashPort.postMessage(draftEventData)
  }
}

var espnPort
var espnTabId
var draftDashPort
var draftDashTabId

function handleConnection(port) {
  console.log('incoming connection!', port.name, port.sender )

  if ( !port.sender ) {
    console.log('Port missing sender')
    return
  }

  if ( port.name !== "ffDraftDashboard") {
    console.log('not a connection from our extension', port.name)
    return
  }

  const tabId = port.sender?.tab?.id
  if ( !tabId || !port.sender.url ) {
    console.log('tab id or url not found ', port.sender.url)
    return
  }

  // Store the connection along with tab ID
  if ( port.sender.url.toLowerCase().includes( 'espn' )) {
    espnTabId = tabId
    espnPort = port
    espnPort.onMessage.addListener(handleIncomingDraftPicks)
    console.log('draft platform connected!')
  } else {
    draftDashPort = port
    draftDashTabId = tabId
    draftDashPort.onMessage.addListener(() => {
      console.log('draft dash keep alive')
      draftDashPort.postMessage(true)
    })
    console.log('draft dashboard connected!')
  }
}