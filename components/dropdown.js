import React, { useState } from "react"

const Dropdown = ({
  className,
  title,
  options, // { title, callback }
  onMouseEnter,
  onMouseLeave,
}) => {
  const [showOptions, setShowOptions] = useState(false)

  return (
    <div className={`flex items-center justify-center h-24 mx-4 border-t ${ className ? className : ''}`}>
      <div className="relative inline-block text-left">
        <div>
          <button type="button"
            className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold shadow-md hover:bg-gray-50"
            id="menu-button"
            aria-expanded="true"
            aria-haspopup="true"
            onClick={() => {
              setShowOptions(!showOptions)
              onMouseLeave && onMouseLeave()
            }}
            onMouseEnter={ onMouseEnter }
            onMouseLeave={ onMouseLeave }
          >
            { title }
            <svg className="-mr-1 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        { showOptions &&
          <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" role="menu" aria-orientation="vertical" aria-labelledby="menu-button" tabIndex="-1">
            <div className="py-1" role="none">
              { options.map( (option, i) => (
                <button type="submit"
                  key={i}
                  className="text-gray-700 block w-full px-4 py-2 text-left text-sm"
                  role="menuitem"
                  tabIndex="-1"
                  id="menu-item-3"
                  onClick={() => {
                    option.callback()
                    setShowOptions(false)
                  }}
                >
                  { option.title }
                </button>
              ))}
            </div>
          </div>
        }
      </div>
    </div>
  )
}

export default Dropdown