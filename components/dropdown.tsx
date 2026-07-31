import React, { KeyboardEvent, useId, useState, useRef, useEffect } from "react";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const handleToggle = () => {
    setIsOpen(!isOpen);
    onMouseLeave && onMouseLeave();
  };

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      window.setTimeout(() => {
        optionRefs.current[event.key === "ArrowDown" ? 0 : options.length - 1]?.focus();
      });
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % options.length
            : (current - 1 + options.length) % options.length;
      optionRefs.current[next]?.focus();
    }
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
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        id={`${menuId}-trigger`}
        type="button"
        className={`cursor-pointer text-sm ${buttonClassName || ''}`}
        onKeyDown={onTriggerKeyDown}
        onClick={handleToggle}
        ref={triggerRef}
      >
        {title}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
          <div
            className="py-1"
            id={menuId}
            role="menu"
            aria-orientation="vertical"
            aria-labelledby={`${menuId}-trigger`}
            onKeyDown={onMenuKeyDown}
          >
            {options.map((option, index) => (
              <button
                key={index}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer z-100"
                role="menuitem"
                ref={element => { optionRefs.current[index] = element; }}
                type="button"
                onClick={() => {
                  option.callback();
                  close();
                }}
              >
                {option.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
