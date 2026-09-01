import {
  DRAFTY_EXTENSION_STORE_URL,
  DRAFTY_EXTENSION_VERSION,
} from "../extensionStore"
import {DraftyWebMcpInputError} from "../webmcp/draftyWebMcp"


export const DRAFTY_HELP_TOPICS = [
  "getting_started",
  "extension_setup",
  "live_draft",
  "rankings_targets",
  "mobile_sync",
  "mock_review",
  "agent_tools",
  "troubleshooting",
] as const

export type DraftyHelpTopic = typeof DRAFTY_HELP_TOPICS[number]
export type DraftyHelpPlatform = "desktop" | "mobile"

export interface DraftyHelpLink {
  label: string
  url: string
}

export interface DraftyHelpArticle {
  topic: DraftyHelpTopic
  title: string
  summary: string
  prerequisites: string[]
  steps: string[]
  notes: string[]
  troubleshooting: string[]
  relatedTools: string[]
  links: DraftyHelpLink[]
}

export interface DraftyHelpInput {
  topic: DraftyHelpTopic
  platform?: DraftyHelpPlatform
}

export interface DraftyHelpResult {
  schema_version: 1
  topic: DraftyHelpTopic
  platform: DraftyHelpPlatform | null
  title: string
  summary: string
  prerequisites: string[]
  steps: string[]
  notes: string[]
  troubleshooting: string[]
  links: DraftyHelpLink[]
  related_tools: string[]
  extension: {
    name: "Drafty Draft Sync"
    version: string
    store_url: string
  }
  platform_note: string | null
}

const links = {
  app: {label: "Open Drafty", url: "https://drafty.friedchickentechnologies.com/"},
  store: {label: "Install Drafty Draft Sync", url: DRAFTY_EXTENSION_STORE_URL},
  privacy: {label: "Privacy policy", url: "/extension-privacy"},
  support: {label: "Report a Drafty issue", url: "https://github.com/tlskins/ff-draft-dashboard/issues/new"},
  espn: {label: "ESPN mock draft lobby", url: "https://fantasy.espn.com/football/mockdraftlobby"},
  nfl: {label: "NFL.com mock drafts", url: "https://fantasy.nfl.com/draftcenter/mockdrafts"},
} as const

export const DRAFTY_HELP_CATALOG: Record<DraftyHelpTopic, DraftyHelpArticle> = {
  getting_started: {
    topic: "getting_started",
    title: "Get started with Drafty",
    summary: "Configure a draft board, optionally synchronize rankings and targets, and connect the published Chrome extension when a supported live draft begins.",
    prerequisites: [
      "Use desktop Chrome for ESPN or NFL.com live-draft capture.",
      "Install Drafty Draft Sync in the same Chrome profile used for the draft room.",
      "Keep Drafty and the supported draft room open in separate tabs during a live draft.",
    ],
    steps: [
      "Open Drafty and set the team count, draft slot, scoring format, starters, ranking source, and ADP source before the draft starts.",
      "Choose Position, ADP round, or Targets on the rankings board; save targets or custom positional ranks as needed.",
      "Sign in with Google only if rankings, targets, and completed draft scorecards should synchronize across devices.",
      "For a live draft, open ESPN or NFL.com in the same Chrome profile and connect the detected room from Drafty's bottom dock.",
      "After any draft completes, open Draft scorecards to inspect the result and deterministic alternate paths.",
    ],
    notes: [
      "Signing in is optional for live pick capture.",
      "Drafty never drafts a player automatically; WebMCP and advisor actions remain bounded to analysis and explicit UI changes.",
    ],
    troubleshooting: [
      "If the draft is not detected, reload both Drafty and the draft-room tab once after installing or updating the extension.",
      "Disable older local FF Draft Pulse copies so only Drafty Draft Sync is active.",
    ],
    relatedTools: ["drafty_get_workspace", "drafty_configure_workspace", "drafty_set_rankings_view"],
    links: [links.app, links.store, links.privacy],
  },
  extension_setup: {
    topic: "extension_setup",
    title: "Install Drafty Draft Sync",
    summary: `Drafty Draft Sync ${DRAFTY_EXTENSION_VERSION} relays live ESPN and NFL.com fantasy-draft picks to an open Drafty dashboard.`,
    prerequisites: [
      "Use Google Chrome on the desktop that will run the draft.",
      "Use the same Chrome profile for Drafty, the extension, and the fantasy draft room.",
    ],
    steps: [
      "Install Drafty Draft Sync from the Chrome Web Store.",
      "Confirm the extension popup identifies Drafty Draft Sync and the current published version.",
      "Open Drafty and a supported ESPN or NFL.com draft room.",
      "If either tab was open before installation, reload both tabs once.",
      "Return to Drafty and select Connect beside the detected draft in the bottom dock.",
    ],
    notes: [
      "The published extension replaces local-development builds named FF Draft Pulse.",
      "The extension has no sign-in requirement and does not retain the draft after its in-memory browser session.",
    ],
    troubleshooting: [
      "At chrome://extensions, confirm Drafty Draft Sync is enabled.",
      "Disable or remove older unpacked copies to prevent duplicate or conflicting draft events.",
      "If Chrome has just reloaded the extension, reload the already-open Drafty and draft-room tabs to replace invalidated content scripts.",
    ],
    relatedTools: ["drafty_get_workspace"],
    links: [links.store, links.app, links.privacy],
  },
  live_draft: {
    topic: "live_draft",
    title: "Connect and use a live draft",
    summary: "Drafty listens for a supported draft through Drafty Draft Sync and updates the board as full draft snapshots arrive.",
    prerequisites: [
      "Drafty Draft Sync is installed and enabled in desktop Chrome.",
      "Drafty and the supported ESPN or NFL.com room are open in the same Chrome profile.",
      "League settings and ranking sources are configured before the first pick whenever possible.",
    ],
    steps: [
      "Join the draft room and wait for Drafty to list it in the bottom dock.",
      "Choose Connect beside the correct detected room.",
      "Keep both tabs open; Drafty will apply picks and update deterministic decision evidence.",
      "Use the rankings board, player profile, and insight deck while the draft is active.",
      "When the final snapshot completes, use the Draft results ready banner or Draft scorecards control to inspect the saved result.",
    ],
    notes: [
      "Cloud ranking and target synchronization pauses after live drafting begins so remote profile changes cannot alter the active board.",
      "Joining a room late may leave early picks absent; Drafty reports captured evidence without inventing missing events.",
    ],
    troubleshooting: [
      "If no room appears, reload Drafty and the draft-room tab, then reopen the extension popup to confirm its version.",
      "If picks stop updating, keep the draft room open and reconnect only to the matching detected room.",
    ],
    relatedTools: ["drafty_get_workspace", "drafty_get_decision_context", "drafty_get_player_evidence"],
    links: [links.espn, links.nfl, links.store],
  },
  rankings_targets: {
    topic: "rankings_targets",
    title: "Manage rankings and targets",
    summary: "Drafty keeps provider rankings separate from a user's custom positional ranks and target-round preferences.",
    prerequisites: [
      "Wait for published rankings and targets to finish hydrating before editing.",
      "Make custom rank changes before players are drafted or purged from the board.",
    ],
    steps: [
      "Choose a published analyst ranking source and one ADP source in Settings.",
      "Use Position to compare positional ranks, ADP round to inspect round windows, or Targets to inspect only saved targets.",
      "Select Edit ranks to copy the active analyst board into Custom, move players within their positions, and save.",
      "Add a target round from a player card and adjust or remove it from the Targets view.",
      "Sign in if these user-authored ranks and targets should synchronize between desktop and mobile.",
    ],
    notes: [
      "A provider refresh updates the provider board but does not overwrite saved Custom positional ranks.",
      "Targeted-player styling supersedes the below-ADP deemphasis filter.",
    ],
    troubleshooting: [
      "If editing is unavailable, inspect the workspace capability reason; rank edits are blocked after the active board has changed through drafting.",
      "If a signed-in device diverges from the cloud copy, Drafty waits for an explicit conflict choice instead of silently overwriting either copy.",
    ],
    relatedTools: [
      "drafty_set_rankings_view",
      "drafty_set_player_target",
      "drafty_start_rank_editing",
      "drafty_move_player_rank",
      "drafty_save_rank_edits",
    ],
    links: [links.app],
  },
  mobile_sync: {
    topic: "mobile_sync",
    title: "Edit on mobile and synchronize devices",
    summary: "The mobile Drafty surface is optimized for positional ranks, ADP rounds, targets, and completed draft scorecards rather than live-draft capture.",
    prerequisites: [
      "Sign in with the same Google account on each device.",
      "Allow the first device to finish synchronizing before making changes on another device.",
    ],
    steps: [
      "Sign in on the device that has the rankings and targets to keep.",
      "Open Drafty on the second device and sign in with the same Google account.",
      "Edit positional ranks or targets on mobile and wait for the synchronized status.",
      "Reload or revisit Drafty on desktop to receive the cloud revision.",
      "If both devices changed independently, explicitly choose the cloud copy or this device when Drafty presents a conflict.",
    ],
    notes: [
      "Ranks, targets, and draft results are separated by fantasy season.",
      "Mobile does not replace desktop Chrome for connecting the Drafty Draft Sync extension to a live draft.",
    ],
    troubleshooting: [
      "If synchronization is waiting, confirm the Google sign-in succeeded and the device is online.",
      "Do not dismiss a conflict by refreshing repeatedly; select the intended copy once the choice is stable.",
    ],
    relatedTools: ["drafty_get_workspace", "drafty_set_player_target", "drafty_save_rank_edits"],
    links: [links.app, links.privacy],
  },
  mock_review: {
    topic: "mock_review",
    title: "Review a completed mock",
    summary: "Drafty saves a season-scoped frozen mock, scores its roster construction, and compares up to three bounded deterministic alternate paths.",
    prerequisites: [
      "The extension must observe a complete or recoverable draft snapshot.",
      "Sign in if the completed mock should synchronize across devices; otherwise Drafty retains a browser-local copy.",
    ],
    steps: [
      "Open the Draft results ready banner or the Draft scorecards control.",
      "Choose a completed mock from the history strip.",
      "Inspect Overview, Position capital, Pick decisions, Alternate paths, and Method.",
      "Optionally choose the first two positions for a deterministic alternate roster path.",
      "Compare tier capital, starter quality, projections above replacement, target conversion, handcuff proxy evidence, and replay collisions.",
    ],
    notes: [
      "Alternative availability uses the ADP and opponent-board rules frozen with the completed mock; it is not a claim that a real room would replay identically.",
      "Opening a synchronized review records a separate receipt without mutating the frozen mock evidence.",
    ],
    troubleshooting: [
      "If a draft did not finalize automatically, use the bounded recovery/import path only with the exported Drafty snapshot from that draft.",
      "If no legal alternate appears, inspect the Method and replay-fidelity evidence before concluding that another roster path was impossible.",
    ],
    relatedTools: ["drafty_list_mock_drafts", "drafty_review_mock_draft", "drafty_open_mock_review"],
    links: [links.app],
  },
  agent_tools: {
    topic: "agent_tools",
    title: "Use Drafty with a compatible browser agent",
    summary: "Drafty's WebMCP tools expose compact first-party state and bounded actions so compatible agents do not need to scrape or click through the dashboard.",
    prerequisites: [
      "Use Codex's built-in browser for native WebMCP discovery, or the Drafty Chrome agent bridge when Codex is controlling your signed-in Chrome session.",
      "Keep Drafty open while the agent is reading or changing workspace state.",
    ],
    steps: [
      "Ask the agent to inspect Drafty's workspace before changing configuration or persistent preferences.",
      "Use player search to resolve a stable player ID before profile, target, or rank actions.",
      "Use deterministic decision, player-evidence, and mock-review reads for analysis rather than asking the agent to calculate those values.",
      "Verify persistent mutations such as targets and custom ranks in the visible Drafty interface.",
    ],
    notes: [
      "Drafty exposes no tool that selects or drafts a player in the external fantasy provider.",
      "Tool availability and mutation reasons are reported in the workspace snapshot.",
      "The Chrome bridge mirrors Drafty's registered WebMCP tool names, inputs, and structured results; it does not grant broader browser or provider access.",
      "Codex Chrome can open Drafty with ?agent-tools=1 to invoke the same registered tool catalog through the structured contract console.",
    ],
    troubleshooting: [
      "If native tools are not discovered in Chrome, verify that window.draftyAgentBridge is ready or use Codex's built-in browser for native WebMCP.",
      "If a mutation is rejected, inspect the returned code and workspace capability reason instead of retrying blindly.",
    ],
    relatedTools: ["drafty_get_workspace", "drafty_search_players", "drafty_get_decision_context"],
    links: [links.app, links.privacy],
  },
  troubleshooting: {
    topic: "troubleshooting",
    title: "Troubleshoot Drafty setup",
    summary: "Start with the current workspace state, extension version, authentication state, and the exact supported draft room before changing or reinstalling anything.",
    prerequisites: [
      "Preserve the current draft-room and Drafty tabs while collecting the visible status.",
      "Do not share authentication tokens, full browser-storage exports, private league credentials, or private account data in a public issue.",
    ],
    steps: [
      "Confirm Drafty loads and the workspace reports whether ranks and targets are hydrated.",
      "For draft capture, confirm only the published Drafty Draft Sync extension is enabled and its popup shows the expected version.",
      "Reload Drafty and the supported draft-room tab once after extension installation or update.",
      "For synchronization, confirm Google authentication and read the visible cloud state or conflict choice.",
      "For a completed mock, inspect local/cloud history before attempting the bounded recovery import.",
    ],
    notes: [
      "MetaMask or another unrelated extension can throw an injected-page error without being a Drafty application failure; isolate unrelated extensions if the browser overlay names them.",
      "Drafty preserves published rankings when local-profile migration data is rejected rather than applying malformed legacy data.",
    ],
    troubleshooting: [
      "Extension context invalidated means an already-open page retained an old content script after an extension reload; reload that page.",
      "An unauthorized-domain Google sign-in error means the exact production hostname must be authorized in Firebase Authentication.",
      "If recovery reports invalid input, stop and use a known Drafty export rather than editing or guessing its JSON.",
    ],
    relatedTools: ["drafty_get_workspace", "drafty_get_help"],
    links: [links.support, links.store, links.privacy],
  },
}

export const parseDraftyHelpInput = (value: unknown): DraftyHelpInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DraftyWebMcpInputError("Tool input must be an object.")
  }
  const input = value as Record<string, unknown>
  const unknown = Object.keys(input).filter(key => !["topic", "platform"].includes(key))
  if (unknown.length > 0) {
    throw new DraftyWebMcpInputError(`Unknown input field: ${unknown[0]}.`)
  }
  const topic = input.topic === undefined ? "getting_started" : input.topic
  if (typeof topic !== "string" || !DRAFTY_HELP_TOPICS.includes(topic as DraftyHelpTopic)) {
    throw new DraftyWebMcpInputError("topic is not a supported Drafty help topic.")
  }
  if (input.platform !== undefined && !["desktop", "mobile"].includes(String(input.platform))) {
    throw new DraftyWebMcpInputError("platform must be desktop or mobile.")
  }
  return {
    topic: topic as DraftyHelpTopic,
    platform: input.platform as DraftyHelpPlatform | undefined,
  }
}

export const getDraftyHelp = ({topic, platform}: DraftyHelpInput): DraftyHelpResult => {
  const article = DRAFTY_HELP_CATALOG[topic]
  const platformNote = platform === "mobile"
    ? "Mobile supports rankings, targets, synchronized profiles, and draft scorecards; connect live drafts from desktop Chrome."
    : platform === "desktop"
      ? "Desktop Chrome supports the full Drafty workspace and the Drafty Draft Sync live-draft connection."
      : null
  return {
    schema_version: 1,
    topic,
    platform: platform || null,
    title: article.title,
    summary: article.summary,
    prerequisites: [...article.prerequisites],
    steps: [...article.steps],
    notes: [...article.notes],
    troubleshooting: [...article.troubleshooting],
    links: article.links.map(link => ({...link})),
    related_tools: [...article.relatedTools],
    extension: {
      name: "Drafty Draft Sync",
      version: DRAFTY_EXTENSION_VERSION,
      store_url: DRAFTY_EXTENSION_STORE_URL,
    },
    platform_note: platformNote,
  }
}
