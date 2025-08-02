/*global chrome*/
import React, { useEffect, useState, useCallback, FC } from "react"
import { toast } from "react-toastify"
import moment, { Moment } from "moment"

import PageHead from "../components/pageHead"
import DraftLoaderOptions from "../components/draftLoaderOptions"
import PositionRankings from "../components/positionRankings"
// import StatsSection from "../components/statsSection"
import {
  // addRankTiers,
  // addDefaultTiers,
  nextPositionPicked,
  predictNextPick,
  parseEspnDraftEvents,
  parseNflDraftEvents,
  PlayerLibrary,
  // Ranks,
  Roster,
  PlayersByPositionAndTeam,
  EspnDraftEventParsed,
  ParsedNflDraftEvent,
  PositionCounts,
  getPlayerMetrics,
} from "../behavior/draft"
import { useRanks } from '../behavior/hooks/useRanks'
import { useDraftBoard } from '../behavior/hooks/useDraftBoard'
import { useRosters } from '../behavior/hooks/useRosters'
import { getPosStyle } from "../behavior/styles"
import { rankablePositions } from "../behavior/draft"
import { Player, FantasyPosition } from "types"

type PredictedPicks = { [playerId: string]: number };
type TierPredictions = {
  [FantasyPosition.QUARTERBACK]: number;
  [FantasyPosition.RUNNING_BACK]: number;
  [FantasyPosition.WIDE_RECEIVER]: number;
  [FantasyPosition.TIGHT_END]: number;
}

let listeningDraftTitle: {
  [key: string]: {
    listening: boolean | null;
    acceptToastId: string | number;
    rejectToastId: string | number;
  };
} = {};
var maxCurrPick = 0
var listenerCheckTimer: NodeJS.Timeout

const Home: FC = () => {
  const {
    // state
    settings, setNumTeams, setIsPpr,
    draftStarted, setDraftStarted,
    myPickNum, setMyPickNum,
    currPick, setCurrPick,
    // memo
    roundIdx,
    isEvenRound,
    currRound,
    currRoundPick,
    currMyPickNum,
    // funcs
    onDraftPlayer,
    onRemoveDraftedPlayer,
    onNavLeft,
    onNavRight,
    onNavRoundUp,
    onNavRoundDown,
  } = useDraftBoard({
    defaultNumTeams: 12,
    defaultMyPickNum: 6,
  })

  // rosters depend on draft board
  const {
    // state
    rosters,
    viewRosterIdx, setViewRosterIdx,
    // funcs
    addPlayerToRoster,
    removePlayerFromRoster,
  } = useRosters({
    numTeams: settings.numTeams,
    myPickNum,
  })

  // ranks depend on draft board
  const {
    // state
    boardSettings,
    playerRanks, onCreatePlayerRanks,
    playerLib, setPlayerLib,
    playersByPosByTeam, setPlayersByPosByTeam,
    noPlayers,
    // funcs
    onRemovePlayerFromBoard,
    onAddAvailPlayer,
    onPurgeAvailPlayer,
    onApplyRankingSortBy,
    onSetRanker,
    onSetAdpRanker,
  } = useRanks({ settings })
  
  const [predictedPicks, setPredictedPicks] = useState<PredictedPicks>({})
  const [showNextPreds, setShowNextPreds] = useState(false)
  const [showPredAvailByRound, setShowPredAvailByRound] = useState(false)
  const [predRunTiers, setPredRunTiers] = useState<TierPredictions>({
    [FantasyPosition.QUARTERBACK]: 0,
    [FantasyPosition.RUNNING_BACK]: 0,
    [FantasyPosition.WIDE_RECEIVER]: 0,
    [FantasyPosition.TIGHT_END]: 0,
  })
  const [predNextTiers, setPredNextTiers] = useState<TierPredictions>({
    [FantasyPosition.QUARTERBACK]: 0,
    [FantasyPosition.RUNNING_BACK]: 0,
    [FantasyPosition.WIDE_RECEIVER]: 0,
    [FantasyPosition.TIGHT_END]: 0,
  })
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [numPostPredicts, setNumPostPredicts] = useState(0)
  // TODO - fix edit custom tiers
  // const [hasCustomTiers, setHasCustomTiers] = useState<boolean | null>(null)
  const [activeDraftListenerTitle, setActiveDraftListenerTitle] = useState<string | null>(null)
  const [lastListenerAck, setLastListenerAck] = useState<Moment | null>(null)
  const [listenerActive, setListenerActive] = useState(false)

  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)

  console.log('fantasySettings', settings)
  console.log('boardSettings', boardSettings)
  console.log('playerLib', playerLib)
  console.log('playersByPosByTeam', playersByPosByTeam)
  console.log('playerRanks', playerRanks)


  const createPlayerLibrary = (players: Player[]) => {
    const playerLib = players.reduce((acc: PlayerLibrary, player) => {
      acc[player.id] = player
      return acc
    }, {})
    setPlayerLib( playerLib )
    const playersByPosByTeam = players.reduce((dict: PlayersByPositionAndTeam, player: Player) => {
      if (player.position) {
        if ( !dict[player.position] ) {
          dict[player.position] = {}
        }
        if (dict[player.position] && !dict[player.position]![player.team] ) {
          dict[player.position]![player.team] = []
        }
        dict[player.position]![player.team]!.push(player)
      }
      return dict
    }, {})
    setPlayersByPosByTeam( playersByPosByTeam )
  }

  // listeners

  useEffect(() => {
    window.addEventListener("message", processListenedDraftPick )
    
    return () => {
      window.removeEventListener("message", processListenedDraftPick )
    }
  }, [settings.numTeams, playerRanks, playerLib, rosters, listeningDraftTitle])

  useEffect(() => {
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [showNextPreds, predictedPicks, playerLib, settings.ppr, noPlayers, currPick, predNextTiers])

  const checkListenerActive = useCallback(() => {
    console.log('checkListenerActive', lastListenerAck, lastListenerAck && moment().diff(lastListenerAck, 'seconds'))
    if (lastListenerAck === null || moment().diff(lastListenerAck, 'seconds') > 5) {
      setListenerActive( false )
    } else {
      setListenerActive( true )
    }

    listenerCheckTimer = setTimeout(checkListenerActive, 6000)
  }, [listenerActive, lastListenerAck])

  useEffect(() => {
    checkListenerActive()

    return () => {
      if ( listenerCheckTimer ) {
        clearTimeout( listenerCheckTimer )
      }
    }
  }, [checkListenerActive])

  // key press / up commands
  const onKeyUp = useCallback( (e: KeyboardEvent) => {
    if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setShowNextPreds( false )
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      // sort by harris
      onApplyRankingSortBy( false )
    } else if (['KeyZ'].includes(e.code)) {
      // show predicted avail by round
      setShowPredAvailByRound( false )
    }
  }, [showNextPreds, predictedPicks, playerLib, playerRanks, settings.ppr, noPlayers, currPick, predNextTiers])

  const onKeyDown = useCallback( (e: KeyboardEvent) => {
    // arrow up
    if (e.code === 'ArrowUp' ) {
      onNavRoundUp()
    // arrow down
    } else if (e.code === 'ArrowDown') {
      onNavRoundDown()
    // arrow left
    } else if ( e.code === 'ArrowLeft' ) {
      onNavLeft()
    // arrow right
    } else if ( e.code === 'ArrowRight' ) {
      onNavRight()
      // alt 
    } else if (['MetaRight', 'MetaLeft'].includes(e.code)) {
      setShowNextPreds(true)
    // shift 
    } else if (['ShiftLeft', 'ShiftRight'].includes(e.code)) {
      onApplyRankingSortBy( true )
    } else if (['KeyZ'].includes(e.code)) {
      // show predicted avail by round
      setShowPredAvailByRound( true )
    }
  }, [ showNextPreds, predictedPicks, playerLib, playerRanks, settings.ppr, noPlayers, currPick, predNextTiers])

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

    if ( listeningDraftTitle[draftTitle] === undefined ) {
      console.log('heard draft initated event', event)
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
            listeningDraftTitle[draftTitle].listening = true
            setActiveDraftListenerTitle( draftTitle )
            toast.dismiss(listeningDraftTitle[draftTitle].rejectToastId)
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
            if (listeningDraftTitle[draftTitle]) {
              listeningDraftTitle[draftTitle].listening = false
              toast.dismiss(listeningDraftTitle[draftTitle].acceptToastId)
            }
          }
        })
      listeningDraftTitle = {
        ...listeningDraftTitle,
        [draftTitle]: {
          listening: null,
          acceptToastId,
          rejectToastId,
        }
      }
      return
    } else if ( !listeningDraftTitle[draftTitle].listening || draftPicksData.length === 0 ) {
      return
    }

    // parse draft event data into structured draft pick
    let draftPicks: (EspnDraftEventParsed | ParsedNflDraftEvent | null)[] | undefined
    if ( platform === 'ESPN') {
      draftPicks = parseEspnDraftEvents( draftPicksData )
    } else if ( platform == 'NFL' ) {
      draftPicks = parseNflDraftEvents( draftPicksData, playersByPosByTeam )
    }

    console.log('heard draft event', event)

    if ( !draftPicks || draftPicks.length === 0 ) {
      return
    }

    // draft players from events
    let lastPickNum = 1
    draftPicks.forEach( draftPick => {
      if (draftPick) {
        const { id, ovrPick } = draftPick
        if ( id && playerLib[id] ) {
        const player = playerLib[id]
          const { fullName, position, team } = player
          console.log('processing pick', player, draftPick)
          const pickNum = ovrPick || (('round' in draftPick && 'pick' in draftPick) ? ((draftPick.round-1) * settings.numTeams) + draftPick.pick : 0)
          onDraftPlayer(String(id), pickNum)
          onRemovePlayerFromBoard( player )
          addPlayerToRoster( player, pickNum )
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
    })

    // set updated draft board and predictions
    setCurrPick(lastPickNum+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
  }, [settings.numTeams, playerRanks, playerLib, rosters, listeningDraftTitle, playersByPosByTeam])
  
  // drafting

  const onSelectPick = (pickNum: number) => {
    setCurrPick(pickNum)
  }

  const onSelectPlayer = (player: Player) => {
    onDraftPlayer(player.id, currPick)
    setCurrPick(currPick+1)
    if ( !draftStarted ) {
      setDraftStarted(true)
    }
    onRemovePlayerFromBoard( player )
    addPlayerToRoster( player, currPick )
  }

  const onRemovePick = (pickNum: number) => {
    const playerId = onRemoveDraftedPlayer(pickNum)
    if (playerId) {
      const player = playerLib[playerId]
      onAddAvailPlayer( player )
      removePlayerFromRoster( player, pickNum )
    }
    setCurrPick(pickNum)
    onChangeNumPostPredicts(numPostPredicts+1)
  }

  const onPurgePlayer = (player: Player) => {
    onPurgeAvailPlayer( player )
  }

  // data import export

  const onChangeNumPostPredicts = (numPostPredicts: number) => {
    setNumPostPredicts(numPostPredicts)
  }

  useEffect(() => {
    predictPicks()
  }, [currPick, myPickNum, settings.numTeams])

  const predictPicks = useCallback(() => {
    if ( rosters.length === 0 ) {
      return
    }
    if (currPick <= maxCurrPick) {
      return
    }

    // build counts of picks by position
    maxCurrPick = currPick
    let posCounts: PositionCounts = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0, "": 0 }
    rosters.forEach( roster => {
      rankablePositions.forEach( pos => {
        if ( pos in roster && posCounts[pos] !== undefined ) {
          posCounts[pos] += (roster[pos as keyof Roster] as string[]).length
        }
      })
    })

    // predict next 5 round
    let pickPredicts: PredictedPicks = {}
    Array.from(Array(5 * settings.numTeams)).forEach((_, i) => {
      if (currRoundPick > 0) {
        const roster = rosters[currRoundPick-1]
        const roundNum = Math.floor((currPick+i-1) / settings.numTeams) + 1
        const positions = nextPositionPicked( roster, roundNum, posCounts )
        const { predicted, updatedCounts } = predictNextPick(
          playerRanks.availPlayersByAdp,
          settings, boardSettings, positions, predictedPicks, posCounts, myPickNum, currPick, currPick + i )
        pickPredicts = predicted
        posCounts = updatedCounts as { [key in FantasyPosition]: number }
      }
    })

    // detect positional runs
    let runDetected = false
    const minTierDiffRun = 2
    const tierRunAlerts = [] as string[]
    Object.keys(predRunTiers).forEach( pos => {
      const posPlayersByAdp = playerRanks.availPlayersByAdp.filter( p => p.position === pos )
      const posTopPlayer = posPlayersByAdp[0]
      if ( !posTopPlayer ) {
        return
      }
      const posNextTopPlayer = posPlayersByAdp[1]
      if ( Boolean(posNextTopPlayer) ) {
        const nextTopPlayerMetrics = getPlayerMetrics(posNextTopPlayer, settings, boardSettings)
        if ( nextTopPlayerMetrics.tier ) {
          const currTier = nextTopPlayerMetrics.tier.tierNumber
          const nextPosPlayersByAdp = posPlayersByAdp.filter( p => ![1, 2].includes(predictedPicks[p.id] ))
          const nextPosTopPlayer = nextPosPlayersByAdp[0]
          const nextTier = nextPosTopPlayer && getPlayerMetrics(nextPosTopPlayer, settings, boardSettings).tier?.tierNumber
          if ( !nextTier || (currTier  && currTier > predRunTiers[pos as keyof TierPredictions] && nextTier - currTier >= minTierDiffRun) ) {
            const playersTaken = posPlayersByAdp.length - nextPosPlayersByAdp.length
            tierRunAlerts.push(
              `Run on ${ pos } down to tier ${ nextTier } after your next pick with ${ playersTaken } ${ pos }s taken `,
            )
          }
        }
      }
    })
    
    tierRunAlerts.forEach( alert => {
      toast(alert, {
        type: 'warning',
        position:'top-right',
        theme: 'colored',
        autoClose: 10000,
      })
    })

    setPredNextTiers(predNextTiers)
    if ( runDetected ) {
      setPredRunTiers(predRunTiers)
    }

    // console.log('Predictions: ', Object.keys( currPredicts ).sort((a,b) => currPredicts[a] - currPredicts[b]).map( id => playerLib[id].name ))
    // console.log('Next Predictions: ', Object.keys( nextPredicts ).sort((a,b) => nextPredicts[a] - nextPredicts[b]).map( id => playerLib[id].name ))

    console.log('next predictions', pickPredicts)
    setPredictedPicks( pickPredicts )
  }, [settings, boardSettings, playerLib, playerRanks, rosters, myPickNum, currPick, currRoundPick, predRunTiers, predNextTiers])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 relative">
      <PageHead />
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center bg-gray-50">
        {/* Draft Settings */}
        <div className="w-screen justify-center z-10 bg-gray-200 shadow-md">
          <DraftLoaderOptions
            onCreatePlayerRanks={onCreatePlayerRanks}
            createPlayerLibrary={createPlayerLibrary}
            arePlayersLoaded={Object.keys( playerLib ).length !== 0}
            settings={settings}
            boardSettings={boardSettings}
            playerLib={playerLib}
          />

          <div className="flex flex-row mb-8 mt-2 w-screen justify-center">
            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                # Teams
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={settings.numTeams}
                onChange={ e => {
                  const newNumTeams = parseFloat(e.target.value)
                  setNumTeams(newNumTeams)
                  setMyPickNum(1)
                }}
                disabled={draftStarted}
              >
                { [10, 12, 14].map( num => <option key={num} value={ num }> { num } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                Your Pick #
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={myPickNum}
                onChange={ e =>  setMyPickNum(parseInt(e.target.value))}
                disabled={draftStarted}
              >
                { Array.from(Array(settings.numTeams)).map( (_, i) => <option key={i+1} value={ i+1 }> { i+1 } </option>) }
              </select>
            </div>

            <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
              <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
                STD / PPR
              </p>
              <select
                className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
                value={settings.ppr ? "PPR" : "Standard"}
                onChange={ e => {
                  const isPpr = e.target.value === "PPR"
                  setIsPpr(isPpr)
                }}
                disabled={draftStarted}
              >
                { ["Standard", "PPR"].map( opt => <option key={opt} value={ opt }> { opt } </option>) }
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center content-center mt-2">
          <div className="flex flex-col items-center w-full">
            { (!activeDraftListenerTitle && !listenerActive) &&
              <p className="bg-gray-300 font-semibold shadow rounded-md text-sm my-1 px-4">
                Listener inactive
              </p>
            }
            { (!activeDraftListenerTitle && listenerActive) &&
              <p className="bg-yellow-300 font-semibold shadow rounded-md text-sm my-1 px-4">
                Listener active...
              </p>
            }
            { activeDraftListenerTitle &&
              <p className="bg-green-300 font-semibold shadow rounded-md text-sm my-1 px-4">
                Listening to: { activeDraftListenerTitle }
              </p>
            }
          </div>

          { alertMsg &&
            <div className="flex flex-row h-full items-center justify-center items-center px-2 py-1 my-4 shadow-lg rounded-lg border-2 bg-green-200">
              <p className="font-semibold text-sm text-green-500 my-1"> { alertMsg } </p>
            </div>
          }
        </div>

        { (!draftStarted && noPlayers && !alertMsg) &&
          <div className="w-full font-semibold shadow rounded-md py-8 pl-32 pr-8 my-8 bg-white">
            <ol className="list-decimal text-left">
              <li className="my-4">
                Download
                <span className="text-blue-600 underline mx-1 cursor-pointer"
                  onClick={() => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US')}
                >
                  chrome extension
                </span>
                to listen to live drafts. Refresh this website after installing extension. Currently support ESPN or NFL.com draft platforms. Just need to install extension, opening extension is not necessary after installation.
              </li>
              <li className="my-4">
                Choose your draft settings including your pick number, # of teams, and format (STD / PPR).
              </li>
              <li className="my-4">
                Load ranks from your favorite analysts to get started.
              </li>
              <li className="my-4">
                Optionally export ranks to csv and edit custom ranks and or tiers.
              </li>
              <li className="my-4">
                Find a mock draft or open your draft platform app in a separate window. Remember to keep your draft platform at least partially visible so that the tab doesn't go to sleep. Press the green alert to start listening to the draft's picks.
              </li>
              <li className="my-4">
                Hover on players to view player profiles and positional stats. Click players to manually select players at current picks. Press left, right arrows to navigate to different picks within a round. Press up and down to navigate to different rounds.
              </li>
            </ol>
          </div>
        }

        <div className="flex flex-col items-center mt-4">
          {/* Stats and Positional Breakdowns */}
          <div className="flex flex-row justify-center w-screen relative my-4">
            { !noPlayers &&
              <div className="flex flex-row px-4 mr-2 overflow-y-scroll rounded border border-4 h-screen shadow-md bg-white">
                {/* TODO - fix stats section */}
                {/* <StatsSection
                  viewPlayerId={viewPlayerId || ''}
                  playerLib={playerLib}
                  posStatsByNumTeamByYear={posStatsByNumTeamByYear}
                  numTeams={numTeams}
                  isStd={isStd}
                /> */}

                <div className="flex flex-col rounded h-full overflow-y-auto ml-2 p-1">
                  <p className="font-semibold underline py-2">
                    Rosters
                  </p>

                  { !draftStarted &&
                    <p className="font-semibold">
                      Waiting for draft...
                    </p>
                  }

                  { draftStarted &&
                    <div className="flex flex-col mr-1 mb-2 text-sm px-2 py-1 bg-gray-100 shadow-md border">
                      <select
                        className="rounded p-1 border font-semibold"
                        value={viewRosterIdx}
                        onChange={ e => setViewRosterIdx(parseInt( e.target.value ))}
                      >
                        { rosters.map((_,i) => {
                          return(
                            <option key={i} value={i}> Team { i+1 } </option>
                          )
                        })}
                      </select>
                      { rankablePositions.map( pos => [rosters[viewRosterIdx][pos as keyof Roster], pos] as [string[], string] ).filter( ([posGroup,]) => posGroup.length > 0 ).map( ([posGroup, pos]) => {
                        return(
                          <div className="mt-1 text-left" key={pos}>
                            <p className="font-semibold"> { pos } ({ posGroup.length }) </p>
                            { posGroup.map( (playerId: string) => {
                              const player = playerLib[playerId]
                              return(
                                <p className="text-xs" key={playerId}> { player.fullName } - { player.team } </p>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  }
                </div>
              </div>
            }

            <PositionRankings
              playerRanks={playerRanks}
              predictedPicks={predictedPicks}
              showNextPreds={showNextPreds}
              myPickNum={myPickNum}
              noPlayers={noPlayers}
              currPick={currPick}
              predNextTiers={predNextTiers}
              showPredAvailByRound={showPredAvailByRound}
              fantasySettings={settings}
              boardSettings={boardSettings}
              onSelectPlayer={onSelectPlayer}
              onPurgePlayer={onPurgePlayer}
              setViewPlayerId={setViewPlayerId}
            />
          </div>
        </div>
      </main>

      { draftStarted &&
        <div className="flex items-center justify-center w-full h-24 border-t border-gray-300 fixed bottom-0 z-10 bg-gray-200">
          {/* <div className="flex flex-col">
            <a href="https://www.flaticon.com/free-icons/pulse" title="pulse icons">Pulse icons created by Kalashnyk - <span className="font-bold ml-2 text-blue-600 underline">Flaticon</span></a>
          </div> */}

          <div className="flex flex-col items-center">
            <p className="font-semibold underline text-center rounded py-1">
              Round { roundIdx+1 } Pick { currRoundPick } (#{ currPick } Overall)
            </p>
            <table className="table-auto">
              <tbody>
                <tr className={`flex justify-between ${isEvenRound ? 'flex-row-reverse' : ''}`}>
                  { currRound.map( (pickedPlayerId, i) => {
                    let bgColor = ""
                    let hover = ""
                    const player = pickedPlayerId ? playerLib[pickedPlayerId] : null
                    if ( i+1 === currRoundPick ) {
                      bgColor = "bg-yellow-400"
                      hover = "hover:bg-yellow-300"
                    } else if ( !!player ) {
                      bgColor = getPosStyle( player.position )
                      hover = "hover:bg-red-300"
                    } else {
                      bgColor = "bg-gray-100"
                      hover = "hover:bg-yellow-200"
                    }
                    const myPickStyle = i+1 === currMyPickNum ? "border-4 border-green-400" : "border"
                    const pickNum = roundIdx*settings.numTeams+(i+1)
                    return(
                      <td className={`flex flex-col p-1 m-1 rounded ${myPickStyle} ${hover} cursor-pointer text-sm ${bgColor} items-center`}
                        onClick={ pickedPlayerId ? () => onRemovePick(pickNum) : () => onSelectPick( pickNum ) }
                        key={i}
                        onMouseEnter={() => {
                          if ( pickedPlayerId ) {
                            setViewPlayerId(pickedPlayerId)
                          }
                        }}
                      >
                        <p className="font-semibold">
                          { `#${pickNum}` } { pickedPlayerId ? ` | Rd ${roundIdx+1} Pick ${i+1}` : "" }
                        </p>
                        { player && <p> { player.fullName } </p> }
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  )
}

export default Home;
