import { PlayerRanks, Roster } from '../behavior/draft'
import { Player, FantasySettings, BoardSettings, RankingSummary, Rankings } from './index'
import { SortOption } from '../pages'
import { HighlightOption } from '../behavior/hooks/usePredictions'
import { DraftView } from '../pages'

export type DraftBoardTitleCard = {
  bgColor: string
  title: string
}

export const isTitleCard = (card: DraftBoardCard): card is DraftBoardTitleCard => {
  return 'title' in card &&
    'bgColor' in card
}

export type DraftBoardCard = Player | DraftBoardTitleCard

export interface DraftBoardColumn {
  columnTitle: string
  cards: DraftBoardCard[]
}

export interface DraftBoard {
  standardView: DraftBoardColumn[]
  predictAvailByRoundView: DraftBoardColumn[]
}

export type PredictedPicks = {
  [key: string]: number
}

// Shared props that all view components need
export interface SharedViewProps {
  playerRanks: PlayerRanks
  predictedPicks: PredictedPicks
  myPickNum: number
  fantasySettings: FantasySettings
  boardSettings: BoardSettings
  currPick: number
  predNextTiers: { [key: string]: number }
  rankingSummaries: RankingSummary[]
  onSelectPlayer: (player: Player) => void
  onPurgePlayer: (player: Player) => void
  setViewPlayerId: (id: string) => void
  rosters: Roster[]
  playerLib: { [key: string]: Player }
  draftStarted: boolean
  getDraftRoundForPickNum: (pickNum: number) => (string | null)[]
  viewPlayerId: string | null
}

// Props specific to ranking view
export interface RankingViewProps extends SharedViewProps {
  sortOption: SortOption
  setSortOption: (option: SortOption) => void
  highlightOption: HighlightOption
  setHighlightOption: (option: HighlightOption) => void
  rankings: Rankings
}

// Props specific to edit rankings view
export interface EditRankingsViewProps extends SharedViewProps {
  hasCustomRanking: boolean
  canEditCustomRankings: boolean
  onReorderPlayer: (playerId: string, position: keyof PlayerRanks, newIndex: number) => void
  onFinishCustomRanking: () => void
  loadCurrentRankings: () => void
  onUpdateTierBoundary: (position: keyof PlayerRanks, tierNumber: number, newBoundaryIndex: number) => void
  saveCustomRankings: () => boolean
  selectedPosition: keyof PlayerRanks
  setSelectedPosition: (position: keyof PlayerRanks) => void
}

// Props for best available by round view
export interface BestAvailByRoundViewProps extends SharedViewProps {
  // This view uses the same shared props without additional view-specific props
}

// Shared state interface
export interface SharedViewState {
  shownPlayerId: string | null
  setShownPlayerId: (id: string | null) => void
  shownPlayerBg: string
  setShownPlayerBg: (bg: string) => void
  draftBoard: DraftBoard
  myRoster: any
  getPlayerDraftRound: (playerId: string) => number
}

// Props for drag and drop (used in edit view)
export interface DragState {
  draggedPlayer: Player | null
  setDraggedPlayer: (player: Player | null) => void
  dragOverIndex: number | null
  setDragOverIndex: (index: number | null) => void
} 