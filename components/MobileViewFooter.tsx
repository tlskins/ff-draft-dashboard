import React, { ReactNode } from 'react'

export interface MobileDropdownItem {
  label: string
  value?: string
  onClick: () => void
  disabled?: boolean
  isSelected?: boolean
}

export interface MobileFooterButton {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

export interface MobileDropdownProps {
  label: string
  isOpen: boolean
  onToggle: () => void
  items: MobileDropdownItem[]
  variant?: 'primary' | 'secondary' | 'purple'
}

export interface MobileViewFooterProps {
  dropdowns?: MobileDropdownProps[]
  buttons?: MobileFooterButton[]
  onClickOutside?: () => void
}

const MobileViewFooter: React.FC<MobileViewFooterProps> = ({
  dropdowns = [],
  buttons = [],
  onClickOutside
}) => {
  const getDropdownButtonStyles = (variant: string = 'primary', isOpen: boolean) => {
    const baseStyles = 'w-full px-3 py-2 text-sm rounded hover:opacity-90 transition-colors flex justify-between items-center'
    
    switch (variant) {
      case 'purple':
        return `${baseStyles} bg-purple-500 text-white hover:bg-purple-600`
      case 'secondary':
        return `${baseStyles} bg-gray-500 text-white hover:bg-gray-600`
      default:
        return `${baseStyles} bg-blue-500 text-white hover:bg-blue-600`
    }
  }

  const getButtonStyles = (variant: string = 'primary', disabled: boolean = false) => {
    const baseStyles = 'px-4 py-2 text-sm rounded transition-colors'
    
    if (disabled) {
      return `${baseStyles} bg-gray-200 text-gray-400 cursor-not-allowed`
    }
    
    switch (variant) {
      case 'secondary':
        return `${baseStyles} bg-gray-500 text-white hover:bg-gray-600`
      case 'danger':
        return `${baseStyles} bg-red-500 text-white hover:bg-red-600`
      default:
        return `${baseStyles} bg-blue-500 text-white hover:bg-blue-600`
    }
  }

  return (
    <div 
      className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-300 p-4 md:hidden z-50"
      onClick={onClickOutside ? (e) => e.stopPropagation() : undefined}
    >
      <div className="flex justify-between items-center space-x-2">
        {/* Dropdowns */}
        {dropdowns.map((dropdown, index) => (
          <div key={index} className="relative flex-1">
            <button
              onClick={dropdown.onToggle}
              className={getDropdownButtonStyles(dropdown.variant, dropdown.isOpen)}
            >
              <span>{dropdown.label}</span>
              <span className={`transform transition-transform ${dropdown.isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {dropdown.isOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-300 rounded shadow-lg">
                {dropdown.items.map((item, itemIndex) => (
                  <button
                    key={itemIndex}
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={`w-full px-3 py-2 text-sm text-left font-medium transition-colors border-b border-gray-200 last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                      item.isSelected
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-blue-500 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Simple Buttons */}
        {buttons.map((button, index) => (
          <button
            key={index}
            onClick={button.onClick}
            disabled={button.disabled}
            className={getButtonStyles(button.variant, button.disabled)}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default MobileViewFooter 