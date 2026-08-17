import React, { useMemo, useState } from "react"
import type {GetStaticProps, GetStaticPropsResult} from "next"

import type { Roster } from "../behavior/draft"
import DraftDeskAppBar from "../components/DraftDeskAppBar"
import DraftDock from "../components/DraftDock"
import styles from "../components/DraftDesk.module.css"
import PageHead from "../components/pageHead"
import DeskPaneHeader from "../components/draft-desk/DeskPaneHeader"
import DeskSegmentedControl from "../components/draft-desk/DeskSegmentedControl"
import DraftDeskPlayerCard from "../components/shared/DraftDeskPlayerCard"
import {
  FantasyPosition,
  NFLTeam,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type {
  BoardSettings,
  FantasySettings,
  Player,
  PlayerRanking,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const boardSettings: BoardSettings = {
  ranker: ThirdPartyRanker.HARRIS,
  adpRanker: ThirdPartyADPRanker.ESPN,
}

const ranking = (
  position: FantasyPosition,
  overallRank: number,
  positionRank: number,
  adp: number,
): PlayerRanking => ({
  playerId: "",
  ranker: ThirdPartyRanker.HARRIS,
  position,
  adp,
  standardOverallRank: overallRank,
  pprOverallRank: overallRank,
  standardPositionRank: positionRank,
  pprPositionRank: positionRank,
  standardPositionTier: {
    tierNumber: positionRank <= 4 ? 1 : 2,
    upperLimitPlayerIdx: 0,
    upperLimitValue: 0,
    lowerLimitPlayerIdx: 5,
    lowerLimitValue: 0,
  },
  pprPositionTier: {
    tierNumber: positionRank <= 4 ? 1 : 2,
    upperLimitPlayerIdx: 0,
    upperLimitValue: 0,
    lowerLimitPlayerIdx: 5,
    lowerLimitValue: 0,
  },
})

const player = (
  id: string,
  fullName: string,
  team: NFLTeam,
  position: FantasyPosition,
  overallRank: number,
  positionRank: number,
  adp: number,
): Player => {
  const [firstName, ...lastName] = fullName.split(" ")
  const harris = ranking(position, overallRank, positionRank, adp)
  const espn = {...harris, ranker: ThirdPartyRanker.ESPN}
  harris.playerId = id
  espn.playerId = id
  return {
    id,
    firstName,
    lastName: lastName.join(" "),
    fullName,
    team,
    position,
    ranks: {
      [ThirdPartyRanker.HARRIS]: harris,
      [ThirdPartyRanker.ESPN]: espn,
    },
  }
}

const players = [
  player("achane", "De'Von Achane", NFLTeam.MIA, FantasyPosition.RUNNING_BACK, 8, 4, 9.2),
  player("taylor", "Jonathan Taylor", NFLTeam.IND, FantasyPosition.RUNNING_BACK, 9, 5, 10.8),
  player("london", "Drake London", NFLTeam.ATL, FantasyPosition.WIDE_RECEIVER, 11, 6, 12.6),
  player("nabers", "Malik Nabers", NFLTeam.NYG, FantasyPosition.WIDE_RECEIVER, 12, 7, 13.1),
  player("hurts", "Jalen Hurts", NFLTeam.PHL, FantasyPosition.QUARTERBACK, 31, 2, 39.1),
  player("kittle", "George Kittle", NFLTeam.SF, FantasyPosition.TIGHT_END, 34, 3, 42.2),
  player("jones", "Aaron Jones", NFLTeam.MIN, FantasyPosition.RUNNING_BACK, 35, 15, 43.1),
  player("waddle", "Jaylen Waddle", NFLTeam.MIA, FantasyPosition.WIDE_RECEIVER, 36, 17, 44.2),
  player("cook", "James Cook", NFLTeam.BUF, FantasyPosition.RUNNING_BACK, 37, 16, 45.1),
  player("smith", "DeVonta Smith", NFLTeam.PHL, FantasyPosition.WIDE_RECEIVER, 38, 18, 46.0),
]

const playerLib = Object.fromEntries(players.map(item => [item.id, item]))
const recentIds = ["hurts", "kittle", "jones", "waddle", "cook", "smith"]
const emptyRoster = (): Roster => ({picks: [], QB: [], RB: [], WR: [], TE: []})

const FixtureLane = ({title, ids, focusedId, onFocus}: {
  title: string
  ids: string[]
  focusedId: string
  onFocus: (id: string) => void
}) => (
  <section className={styles.positionLane}>
    <header className={styles.positionLaneHeader}>
      <span>{title}</span><span>{ids.length} available</span>
    </header>
    <div className={styles.positionLaneCards}>
      {ids.map((id, index) => (
        <DraftDeskPlayerCard
          boardSettings={boardSettings}
          compact
          fantasySettings={settings}
          focused={id === focusedId}
          key={id}
          onFocusPlayer={onFocus}
          player={playerLib[id]}
          rankContext={`Rank ${index + 8}`}
        />
      ))}
    </div>
  </section>
)

const Phase14AVisualFixture = () => {
  const [focusedId, setFocusedId] = useState("achane")
  const [dockHeight, setDockHeight] = useState(0)
  const rosters = useMemo(() => Array.from({length: 12}, (_, index) => {
    if (index === 5) {
      return {
        picks: ["hurts", "london"],
        QB: ["hurts"], RB: [], WR: ["london"], TE: [],
      }
    }
    return emptyRoster()
  }), [])
  const draftHistory = useMemo<(string | null)[]>(() => [
    ...Array.from({length: 36}, () => null),
    ...recentIds,
    null,
  ], [])
  const currRound = useMemo<(string | null)[]>(() => [
    ...recentIds,
    ...Array.from({length: 6}, () => null),
  ], [])

  return (
    <div className={`relative flex min-h-screen flex-col ${styles.deskViewport}`}>
      <PageHead />
      <main className={`flex w-full flex-1 flex-col bg-gray-50 ${styles.deskMain}`}>
        <DraftDeskAppBar
          activeDraftListenerTitle="Home League"
          boardSettings={boardSettings}
          draftCaptureState="live"
          draftPersistence={{state: "local", pendingEventCount: 0, error: null, canRetry: false}}
          draftSourceHealth={null}
          draftSourceHealthFreshness="fresh"
          draftStarted
          myPickNum={6}
          onRetryDraftPersistence={() => undefined}
          onSetAdpRanker={() => undefined}
          onSetRanker={() => undefined}
          setIsPpr={() => undefined}
          setMyPickNum={() => undefined}
          setNumTeams={() => undefined}
          settings={settings}
        />
        <div className={`${styles.deskBody} flex min-h-0 flex-1 flex-col`}>
          <div
            className={`${styles.desk} ${styles.deskShell} flex w-full flex-1`}
            style={{"--draft-desk-dock-height": `${dockHeight}px`} as React.CSSProperties}
          >
            <div className={styles.centerPanes}>
              <section aria-label="Rankings pane" className={`${styles.pane} flex min-h-0 flex-col`}>
                <DeskPaneHeader
                  actions={<DeskSegmentedControl ariaLabel="Rankings mode" items={[{id: "position", label: "Position"}, {id: "round", label: "ADP round"}]} onSelect={() => undefined} selectedId="position" />}
                  kicker="Board"
                  title="Rankings"
                />
                <div className={styles.positionLanes}>
                  <FixtureLane focusedId={focusedId} ids={["achane", "taylor", "jones", "cook"]} onFocus={setFocusedId} title="RUNNING BACK" />
                  <FixtureLane focusedId={focusedId} ids={["london", "nabers", "waddle", "smith"]} onFocus={setFocusedId} title="WIDE RECEIVER" />
                </div>
              </section>
              <section aria-label="Player profile and history" className={`${styles.pane} text-left`}>
                <DeskPaneHeader kicker="Player profile" meta={`${playerLib[focusedId].team} · ${playerLib[focusedId].position}`} title={playerLib[focusedId].fullName} />
                <div className="grid grid-cols-4 border-b border-slate-300 bg-white text-[10px]">
                  <div className="p-2"><span>POS RANK</span><strong className="block text-xs">RB 4</strong></div>
                  <div className="p-2"><span>PROJ RANGE</span><strong className="block text-xs">16.8–20.4</strong></div>
                  <div className="p-2"><span>AVAIL. NEXT</span><strong className="block text-xs">18%</strong></div>
                  <div className="p-2"><span>BYE</span><strong className="block text-xs">12</strong></div>
                </div>
                <div className="p-3 text-xs text-slate-600">Populated profile history is reserved for checkpoint B.</div>
              </section>
              <section aria-label="Deterministic insight pane" className={`${styles.pane} text-left`}>
                <DeskPaneHeader kicker="Decision view · auto" title="Cross-position value" />
                <div className="space-y-2 p-3 text-xs text-slate-700">
                  <p>RB value falls before your next turn while the current WR tier is likely to survive.</p>
                  <div className="border border-slate-300 bg-white p-2"><strong>De&apos;Von Achane</strong><span className="float-right">+6.4</span></div>
                  <div className="border border-slate-300 bg-white p-2"><strong>Drake London</strong><span className="float-right">+4.8</span></div>
                  <div className="border border-slate-300 bg-white p-2"><strong>George Kittle</strong><span className="float-right">+3.9</span></div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <DraftDock
        boardSettings={boardSettings}
        currPick={43}
        currRound={currRound}
        currRoundPick={7}
        draftHistory={draftHistory}
        connected
        connectionDetail="Pick feed current"
        connectionLabel="ESPN connected"
        isEvenRound
        myPickNum={6}
        myPicks={[6, 19, 30, 46, 57]}
        onHeightChange={setDockHeight}
        onRemovePick={() => undefined}
        playerLib={playerLib}
        rosters={rosters}
        roundIdx={3}
        setCurrPick={() => undefined}
        setViewPlayerId={id => id && setFocusedId(id)}
        settings={settings}
      />
    </div>
  )
}

export const phase14aVisualFixtureRouteResult = (
  environment = process.env.NODE_ENV,
): GetStaticPropsResult<Record<string, never>> => environment === "production"
  ? {notFound: true}
  : {props: {}}

export const getStaticProps: GetStaticProps = async () =>
  phase14aVisualFixtureRouteResult()

export default Phase14AVisualFixture
