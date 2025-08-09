import React, { useState, useRef, useEffect } from "react";

type Option = {
  title: string;
  callback: () => void;
};

type DropdownProps = {
  title: string;
  options: Option[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
  buttonClassName?: string;
};

const Dropdown: React.FC<DropdownProps> = ({
  title,
  options,
  onMouseEnter,
  onMouseLeave,
  className,
  buttonClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    onMouseLeave && onMouseLeave();
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div
      className={`relative px-3 py-1 text-sm rounded shadow text-left ${className || ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={dropdownRef}
    >
      <button
        type="button"
        className={`cursor-pointer text-sm ${buttonClassName || ''}`}
        onClick={handleToggle}
      >
        {title}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
          <div
            className="py-1"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="options-menu"
          >
            {options.map((option, index) => (
              <a
                key={index}
                href="#"
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault();
                  option.callback();
                  setIsOpen(false);
                }}
              >
                {option.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;