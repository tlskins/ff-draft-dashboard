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

var draftPlatformPort
var draftDashPort

function handleConnection(port) {
  console.log('incoming connection!', port.name, port.sender )
  const senderUrl = port.sender.url

  if ( !port.sender ) {
    console.log('Port missing sender')
    return
  }

  if ( port.name !== "ffDraftDashboard") {
    console.log('not a connection from our extension', port.name)
    return
  }

  const tabId = port.sender?.tab?.id
  if ( !tabId || !senderUrl ) {
    console.log('tab id or url not found ', senderUrl)
    return
  }

  // Store the connection along with tab ID
  if ( ['espn', 'nfl'].some( draftPlatformSubstr => senderUrl.toLowerCase().includes( draftPlatformSubstr ))) {
    draftPlatformPort = port
    draftPlatformPort.onMessage.addListener(handleIncomingDraftPicks)
    console.log('draft platform connected!')
  } else {
    draftDashPort = port
    draftDashPort.onMessage.addListener(() => {
      console.log('draft dash keep alive')
      draftDashPort.postMessage(true)
    })
    console.log('draft dashboard connected!')
  }
}