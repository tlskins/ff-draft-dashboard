import { readFile, writeFile } from "node:fs/promises"

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1])
}

const boardPath = args.get("--board")
const rankingsPath = args.get("--rankings")
const outputPath = args.get("--out")
const ranker = args.get("--ranker") || "ESPN"

if (!boardPath || !rankingsPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/create-espn-replay-fixture.mjs "
    + "--board <board.json> --rankings <rankings.json> --out <fixture.json> "
    + "[--ranker ESPN]",
  )
}

const board = JSON.parse(await readFile(boardPath, "utf8"))
const rankings = JSON.parse(await readFile(rankingsPath, "utf8"))
const supportedPositions = new Set(["QB", "RB", "WR", "TE"])
const normalizePosition = (position) =>
  position.split(",")[0]?.trim() || position
const normalizeName = (name) =>
  name
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(iii|ii|jr|sr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

const numTeams = board.headers.length
const targetRosterIndex = board.headers.findIndex(header => header.isUser)
if (numTeams < 2 || targetRosterIndex < 0) {
  throw new Error("Board must identify league teams and the user's team")
}

const ppr = /\bPPR\b/i.test(board.title)
const summary = rankings.rankings_summaries.find(item =>
  item.ranker === "Last Season PPG" && item.ppr === ppr)
if (!summary) throw new Error("Rankings lack the required PPG projection summary")

const rankedPlayers = rankings.players.flatMap(player => {
  if (!supportedPositions.has(player.position)) return []
  const selectedRank = player.ranks?.[ranker]
  const adpRank = player.ranks?.ESPN
  const positionRank = ppr
    ? selectedRank?.ppr_position_rank
    : selectedRank?.standard_position_rank
  if (!Number.isFinite(positionRank)) return []
  const positionProjectionTiers = summary.tiers[player.position] || []
  const projectionTier = positionProjectionTiers.find(tier =>
    positionRank - 1 >= tier.upper_limit_player_idx
    && positionRank - 1 <= tier.lower_limit_player_idx)
    || positionProjectionTiers.at(-1)
  if (!projectionTier) return []
  const selectedTier = ppr
    ? selectedRank?.ppr_position_tier
    : selectedRank?.standard_position_tier
  const floor = Math.min(
    projectionTier.lower_limit_value,
    projectionTier.upper_limit_value,
  )
  const ceiling = Math.max(
    projectionTier.lower_limit_value,
    projectionTier.upper_limit_value,
  )
  return [{
    id: player.id,
    name: player.full_name,
    position: player.position,
    team: player.team,
    adp: adpRank?.adp ?? 999,
    positionRank,
    userTier: selectedTier?.tier_number ?? positionRank,
    projectedFloor: floor,
    projectedMedian: (floor + ceiling) / 2,
    projectedCeiling: ceiling,
  }]
})

const playersByNameAndPosition = new Map(
  rankedPlayers.map(player => [
    `${normalizeName(player.name)}:${player.position}`,
    player,
  ]),
)
const rosterIndexForPick = (overallPick) => {
  const roundIndex = Math.floor((overallPick - 1) / numTeams)
  const pickIndex = (overallPick - 1) % numTeams
  return roundIndex % 2 === 0 ? pickIndex : numTeams - pickIndex - 1
}

const actualPicks = board.picks
  .map(pick => {
    const position = normalizePosition(pick.position)
    const advisorEligible = supportedPositions.has(position)
    const player = advisorEligible
      ? playersByNameAndPosition.get(
          `${normalizeName(pick.name)}:${position}`,
        )
      : null
    if (advisorEligible && !player) {
      throw new Error(
        `Drafted player ${pick.name} (${position}) lacks replay projections`,
      )
    }
    return {
      overallPick: pick.overallPick,
      rosterIndex: rosterIndexForPick(pick.overallPick),
      playerId: player?.id || null,
      name: pick.name,
      position: pick.position,
      advisorEligible,
    }
  })
  .sort((left, right) => left.overallPick - right.overallPick)

const targetAdvisorPicks = actualPicks.filter(pick =>
  pick.rosterIndex === targetRosterIndex && pick.advisorEligible).length
const starters = {
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
}
const startingRosterSize = Object.values(starters).reduce(
  (total, count) => total + count,
  0,
)
const totalPicks = board.picks.length
const numRounds = Math.max(...board.picks.map(pick => pick.round))
const capturedAt = Date.parse(board.capturedAt)
const fixtureDate = new Date(capturedAt).toISOString().slice(0, 10)
const leagueId = new URL(board.sourceUrl).searchParams.get("leagueId")
if (!leagueId) throw new Error("ESPN source URL is missing leagueId")
const sourceUrl =
  `https://fantasy.espn.com/football/draft?leagueId=${encodeURIComponent(leagueId)}`

const fixture = {
  fixtureVersion: 1,
  id: `ESPN:${leagueId}:${fixtureDate}:slot-${targetRosterIndex + 1}`,
  provenance: "recorded",
  source: {
    platform: "ESPN",
    title: board.title,
    sourceUrl,
    capturedAt,
    totalPicks,
    numRounds,
    platformRosterSize: numRounds,
    excludedPositions: Array.from(new Set(
      board.picks
        .map(pick => pick.position)
        .filter(position => !supportedPositions.has(
          normalizePosition(position),
        )),
    )),
    rankingProfile: ranker,
  },
  settings: {
    ppr,
    numTeams,
    ...starters,
    numBenchPlayers: targetAdvisorPicks - startingRosterSize,
  },
  targetRosterIndex,
  replacementPoints: {
    QB: summary.replacement_levels.QB[1],
    RB: summary.replacement_levels.RB[1],
    WR: summary.replacement_levels.WR[1],
    TE: summary.replacement_levels.TE[1],
  },
  players: rankedPlayers,
  actualPicks,
}

if (actualPicks.length !== numTeams * numRounds) {
  throw new Error(
    `Expected ${numTeams * numRounds} picks, received ${actualPicks.length}`,
  )
}
if (targetAdvisorPicks !== startingRosterSize + fixture.settings.numBenchPlayers) {
  throw new Error("Target roster capacity does not match its eligible picks")
}

await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(JSON.stringify({
  outputPath,
  totalPicks,
  targetRosterIndex,
  targetAdvisorPicks,
  replayPlayers: rankedPlayers.length,
  excludedPositions: fixture.source.excludedPositions,
}, null, 2))
