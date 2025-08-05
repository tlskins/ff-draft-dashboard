import { useEffect, useState, useCallback, useRef } from "react"
import { toast } from "react-toastify"
import moment, { Moment } from "moment"
import {
  parseEspnDraftEvents,
  parseNflDraftEvents,
  PlayerLibrary,
  PlayersByPositionAndTeam,
  EspnDraftEventParsed,
  ParsedNflDraftEvent,
  Roster,
} from "../draft"

interface UseDraftListenerProps {
  playerLib: PlayerLibrary;
  playersByPosByTeam: PlayersByPositionAndTeam;
  rosters: Roster[];
  settings: { numTeams: number };
  onDraftPlayer: (playerId: string, pickNum: number) => void;
  setCurrPick: (pick: number) => void;
  setDraftStarted: (started: boolean) => void;
  draftStarted: boolean;
}

export const useDraftListener = ({
  playerLib,
  playersByPosByTeam,
  rosters,
  settings,
  onDraftPlayer,
  setCurrPick,
  setDraftStarted,
  draftStarted,
}: UseDraftListenerProps) => {
  const listeningDraftTitle = useRef<{
    [key: string]: {
      listening: boolean | null;
      acceptToastId: string | number;
      rejectToastId: string | number;
    };
  }>({});

  const [activeDraftListenerTitle, setActiveDraftListenerTitle] = useState<string | null>(null)
  const [lastListenerAck, setLastListenerAck] = useState<Moment | null>(null)
  const [listenerActive, setListenerActive] = useState(false)
  
  const listenerCheckTimer = useRef<NodeJS.Timeout | null>(null)

  const checkListenerActive = useCallback(() => {
    if (lastListenerAck === null || moment().diff(lastListenerAck, 'seconds') > 5) {
      setListenerActive( false )
    } else {
      setListenerActive( true )
    }

    if (typeof window !== 'undefined') {
      listenerCheckTimer.current = setTimeout(checkListenerActive, 6000)
    }
  }, [lastListenerAck, setListenerActive])

  useEffect(() => {
    checkListenerActive()

    return () => {
      if ( listenerCheckTimer.current ) {
        clearTimeout( listenerCheckTimer.current )
      }
    }
  }, [checkListenerActive])

  const processListenedDraftPick = useCallback( (event: MessageEvent) => {
    if ( event.data.type !== "FROM_EXT" || Object.values( playerLib ).length === 0 ) {
      return
    }
    if ( event.data.draftData === true ) {
      console.log('listener ack received in app')
      setLastListenerAck(moment())
      return
    }
    const { draftData: { draftPicks: draftPicksData, draftTitle, platform } } = event.data

    if ( listeningDraftTitle.current[draftTitle] === undefined ) {
      const acceptToastId = toast(
        `Listen to draft: ${ draftTitle }`,
        {
          autoClose: false,
          hideProgressBar: true,
          type: 'success',
          theme: 'colored',
          position:'top-right',
          containerId: 'AcceptListenDraft',
          onClick: () => {
            if(listeningDraftTitle.current[draftTitle]) {
              listeningDraftTitle.current[draftTitle]!.listening = true
            }
            setActiveDraftListenerTitle( draftTitle )
            toast.dismiss(listeningDraftTitle.current[draftTitle]!.rejectToastId)
          }
        })
      const rejectToastId = toast(
        `Ignore draft: ${ draftTitle }`,
        {
          autoClose: false,
          hideProgressBar: true,
          type: 'error',
          theme: 'colored',
          position:'top-right',
          containerId: 'RejectListenDraft',
          onClick: () => {
            if (listeningDraftTitle.current[draftTitle]) {
              listeningDraftTitle.current[draftTitle]!.listening = false
              toast.dismiss(listeningDraftTitle.current[draftTitle]!.acceptToastId)
            }
          }
        })
      listeningDraftTitle.current = {
        ...listeningDraftTitle.current,
        [draftTitle]: {
          listening: null,
          acceptToastId,
          rejectToastId,
        }
      }
      return
    } else if ( !listeningDraftTitle.current[draftTitle]?.listening || draftPicksData.length === 0 ) {
      return
    }

    let draftPicks: (EspnDraftEventParsed | ParsedNflDraftEvent | null)[] | undefined
    if ( platform === 'ESPN') {
      draftPicks = parseEspnDraftEvents( draftPicksData )
    } else if ( platform === 'NFL' ) {
      draftPicks = parseNflDraftEvents( draftPicksData, playersByPosByTeam )
    }

    if ( !draftPicks || draftPicks.length === 0 ) {
      return
    }

    let lastPickNum = 1
    draftPicks.forEach( draftPick => {
      if (draftPick) {
        const { id, ovrPick } = draftPick
        if ( id && playerLib[id] ) {
        const player = playerLib[id]
          const { fullName, position, team } = player
          const pickNum = ovrPick || (('round' in draftPick && 'pick' in draftPick) ? ((draftPick.round-1) * settings.numTeams) + draftPick.pick : 0)
          if (pickNum > 0) {
            onDraftPlayer(String(id), pickNum)
            lastPickNum = pickNum
            toast(
              `Pick #${pickNum}: ${ fullName } - ${ position } - ${ team }`,
              {
                type: 'success',
                theme: 'colored',
                position:'top-right',
              })
          }
        }
      }
    })

    setCurrPick(lastPickNum+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }, [settings.numTeams, playerLib, rosters, playersByPosByTeam, draftStarted, onDraftPlayer, setCurrPick, setDraftStarted])
  
  useEffect(() => {
    window.addEventListener("message", processListenedDraftPick )
    
    return () => {
      window.removeEventListener("message", processListenedDraftPick )
    }
  }, [processListenedDraftPick])

  return { listenerActive, activeDraftListenerTitle }
} 