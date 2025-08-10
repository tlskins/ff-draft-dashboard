import React, { useState } from "react"
import Dropdown from "./dropdown"
import { ThirdPartyRanker, ThirdPartyADPRanker, FantasyRanker } from "../types"

interface HeaderProps {
  settings: {
    numTeams: number
    ppr: boolean
  }
  boardSettings: {
    ranker: FantasyRanker
    adpRanker: ThirdPartyADPRanker
  }
  draftStarted: boolean
  myPickNum: number
  setNumTeams: (numTeams: number) => void
  setIsPpr: (isPpr: boolean) => void
  setMyPickNum: (pickNum: number) => void
  onSetRanker: (ranker: ThirdPartyRanker) => void
  onSetAdpRanker: (ranker: ThirdPartyADPRanker) => void
}

const Header: React.FC<HeaderProps> = ({
  settings,
  boardSettings,
  draftStarted,
  myPickNum,
  setNumTeams,
  setIsPpr,
  setMyPickNum,
  onSetRanker,
  onSetAdpRanker,
}) => {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)

  const toggleHeaderCollapse = () => {
    setIsHeaderCollapsed(!isHeaderCollapsed)
  }

  return (
    <div 
      className={`w-screen z-10 shadow-md transition-all duration-500 ease-in-out overflow-hidden ${
        isHeaderCollapsed ? 'h-6' : 'h-auto'
      }`} 
      style={{backgroundColor: '#FFF7E3'}}
    >
      {/* Toggle Button */}
      <div className="w-full flex justify-center">
        <button
          onClick={toggleHeaderCollapse}
          className="px-4 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none transition-colors duration-200"
          aria-label={isHeaderCollapsed ? "Expand settings" : "Collapse settings"}
        >
          <svg
            className={`w-5 h-5 transform transition-transform duration-300 ${
              isHeaderCollapsed ? 'rotate-180' : 'rotate-0'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Settings Content */}
      <div className={`flex-1 flex flex-col items-center px-4 transition-opacity duration-700 ease-in-out ${
        isHeaderCollapsed ? 'opacity-0' : 'opacity-100'
      }`}>
        {/* Logo */}
        <div className="flex-shrink-0">
          <img 
            src="/friedchickentechlogo.png" 
            alt="Drafty Logo" 
            className="h-32 w-auto"
          />
        </div>

        <h2 className="text-2xl font-bold">
          Drafty
        </h2>

        <div className="flex flex-row mb-4 mt-2 justify-center">
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

          <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              Ranker
            </p>
            <select
              className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
              value={boardSettings.ranker}
              onChange={ e => {
                onSetRanker(e.target.value as ThirdPartyRanker)
              }}
              disabled={draftStarted}
            >
              { Object.values(ThirdPartyRanker).map( ranker => <option key={ranker} value={ ranker }> { ranker } </option>) }
            </select>
          </div>

          <div className={`flex flex-row text-sm text-center mr-4 rounded shadow-md ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              ADP Source
            </p>
            <select
              className={`p-1 m-1 border rounded ${draftStarted ? 'bg-gray-300' : ''}`}
              value={boardSettings.adpRanker}
              onChange={ e => {
                onSetAdpRanker(e.target.value as ThirdPartyADPRanker)
              }}
              disabled={draftStarted}
            >
              { Object.values(ThirdPartyADPRanker).map( ranker => <option key={ranker} value={ ranker }> { ranker } </option>) }
            </select>
          </div>
        </div>

        <div className="flex flex-col w-full h-14 relative mb-4">
          <div className="flex w-full justify-center items-center">
            <div>
              <Dropdown
                title="Download Extension"
                options={[
                  { title: "Download", callback: () => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US') },
                ]}
                className="m-2 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer bg-gray-100 shadow-md"
                buttonClassName="font-semibold tracking-wide uppercase"
              />
            </div>

            <Dropdown
              title="Find Mock Draft"
              options={[
                { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) },
                { title: "NFL.com Mock Draft", callback: () => window.open('https://fantasy.nfl.com/draftcenter/mockdrafts') },
              ]}
              className="m-2 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer bg-gray-100 shadow-md"
              buttonClassName="font-semibold tracking-wide uppercase"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Header 