import React from 'react'

export enum MobileView {
  OVERVIEW = 'overview',
  RANKINGS = 'rankings', 
  ADP = 'adp'
}

interface MobileFooterProps {
  currentView: MobileView
  onViewChange: (view: MobileView) => void
}

const MobileFooter: React.FC<MobileFooterProps> = ({ currentView, onViewChange }) => {
  const buttons = [
    {
      view: MobileView.OVERVIEW,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      label: 'Overview'
    },
    {
      view: MobileView.RANKINGS,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      label: 'Rankings'
    },
    {
      view: MobileView.ADP,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      label: 'ADP'
    }
  ]

  return (
    <div className="fixed bottom-0 h-12 left-0 right-0 bg-white border-t border-gray-300 md:hidden z-40 w-full">
      <div className="flex justify-around py-1 mb-2">
        {buttons.map(({ view, icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`flex flex-col items-center py-1 px-2 transition-colors ${
              currentView === view
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            <div className="w-4 h-4">
              {React.cloneElement(icon, { className: 'w-4 h-4' })}
            </div>
            <span className="text-xs mt-0.5">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default MobileFooter 