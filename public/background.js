let eventListenerActive = false

// Function to start event listener
function startEventListener() {
  if (!eventListenerActive) {
    console.log('starting event listener')
    eventListenerActive = true
    
    // Add your event listener logic here
    chrome.runtime.onConnect.addListener(handleConnection)
  }
}

// Function to stop event listener
function stopEventListener() {
  if (eventListenerActive) {
    console.log('stopping event listener')
    eventListenerActive = false
    
    // Remove the event listener here
    chrome.runtime.onMessage.removeListener(handleConnection)
    espnPort?.onMessage.removeListener(handleIncomingDraftPicks)
  }
}

// Start the event listener when extension starts
startEventListener()

// Listen for Chrome window closed event
chrome.windows.onRemoved.addListener((windowId) => {
  // Check if there are no more open windows
  chrome.windows.getAll((windows) => {
    if (windows.length === 0) {
      // If all Chrome windows are closed, stop the event listener and perform cleanup
      stopEventListener()
      console.log("All Chrome windows closed. Cleaned up listeners.")
    }
  })
})


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
    console.log('draft dashboard connected!')
  }

  // Handle disconnection
  port.onDisconnect.addListener(() => {
    if ( espnPort ) {
      espnPort = undefined
    }
    if ( draftDashPort ) {
      draftDashPort = undefined
    }
  })
}