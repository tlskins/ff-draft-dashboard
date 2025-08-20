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
      className={`w-full z-10 shadow-md transition-all duration-500 ease-in-out md:w-screen ${
        isHeaderCollapsed ? 'md:h-6 h-auto' : 'h-auto'
      } md:min-h-0`} 
      style={{backgroundColor: '#FFF7E3'}}
    >
      {/* Toggle Button - Hidden on Mobile */}
      <div className="w-full justify-center hidden md:flex">
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
        isHeaderCollapsed ? 'md:opacity-0 opacity-100' : 'opacity-100'
      } md:pb-0 pb-20`}>
        {/* Logo */}
        <div className="flex-shrink-0 md:mb-0 mb-4">
          <img 
            src="/friedchickentechlogo.png" 
            alt="Drafty Logo" 
            className="md:h-32 h-24 w-auto"
          />
        </div>

        <h2 className="md:text-2xl text-xl font-bold md:mb-0 mb-6">
          Drafty
        </h2>

        <div className="flex md:flex-row flex-col md:mb-4 mb-6 md:mt-2 mt-0 justify-center md:gap-0 gap-4 w-full md:w-auto">
          <div className={`flex flex-row text-sm text-center md:mr-4 mr-0 rounded shadow-md md:w-auto w-full justify-between ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              # Teams
            </p>
            <select
              className={`p-1 m-1 border rounded md:w-auto w-24 ${draftStarted ? 'bg-gray-300' : ''}`}
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

          <div className={`flex flex-row text-sm text-center md:mr-4 mr-0 rounded shadow-md md:w-auto w-full justify-between ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              Your Pick #
            </p>
            <select
              className={`p-1 m-1 border rounded md:w-auto w-24 ${draftStarted ? 'bg-gray-300' : ''}`}
              value={myPickNum}
              onChange={ e =>  setMyPickNum(parseInt(e.target.value))}
              disabled={draftStarted}
            >
              { Array.from(Array(settings.numTeams)).map( (_, i) => <option key={i+1} value={ i+1 }> { i+1 } </option>) }
            </select>
          </div>

          <div className={`flex flex-row text-sm text-center md:mr-4 mr-0 rounded shadow-md md:w-auto w-full justify-between ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              STD / PPR
            </p>
            <select
              className={`p-1 m-1 border rounded md:w-auto w-24 ${draftStarted ? 'bg-gray-300' : ''}`}
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

          <div className={`flex flex-row text-sm text-center md:mr-4 mr-0 rounded shadow-md md:w-auto w-full justify-between ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              Ranker
            </p>
            <select
              className={`p-1 m-1 border rounded md:w-auto w-32 ${draftStarted ? 'bg-gray-300' : ''}`}
              value={boardSettings.ranker}
              onChange={ e => {
                onSetRanker(e.target.value as ThirdPartyRanker)
              }}
              disabled={draftStarted}
            >
              { Object.values(ThirdPartyRanker).map( ranker => <option key={ranker} value={ ranker }> { ranker } </option>) }
            </select>
          </div>

          <div className={`flex flex-row text-sm text-center md:mr-4 mr-0 rounded shadow-md md:w-auto w-full justify-between ${draftStarted ? 'bg-gray-300' : 'bg-gray-100' }`}>
            <p className="align-text-bottom align-bottom p-1 m-1 font-semibold">
              ADP Source
            </p>
            <select
              className={`p-1 m-1 border rounded md:w-auto w-32 ${draftStarted ? 'bg-gray-300' : ''}`}
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

        <div className="hidden md:flex flex-col w-full md:h-14 h-auto relative md:mb-4 mb-0">
          <div className="flex md:flex-row flex-col w-full justify-center items-center md:gap-0 gap-4">
            <div className="md:w-auto w-full">
              <Dropdown
                title="Download Extension"
                options={[
                  { title: "Download", callback: () => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US') },
                ]}
                className="md:m-2 m-0 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer bg-gray-100 shadow-md md:w-auto w-full"
                buttonClassName="font-semibold tracking-wide uppercase md:w-auto w-full"
              />
            </div>

            <div className="md:w-auto w-full">
              <Dropdown
                title="Find Mock Draft"
                options={[
                  { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ff${new Date().getFullYear()}`) },
                  { title: "NFL.com Mock Draft", callback: () => window.open('https://fantasy.nfl.com/draftcenter/mockdrafts') },
                ]}
                className="md:m-2 m-0 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer bg-gray-100 shadow-md md:w-auto w-full"
                buttonClassName="font-semibold tracking-wide uppercase md:w-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Header 