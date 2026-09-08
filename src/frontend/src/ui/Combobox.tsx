import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboboxProps {
  /** Field name; the current value is submitted under this key. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Known values to search and pick from. */
  options: string[];
  placeholder?: string;
  testId?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  ariaRequired?: boolean;
  disabled?: boolean;
}

/**
 * Type-to-search single select that also accepts a brand-new value: whatever
 * is typed becomes the value, and matching known options can be picked from the
 * list. This lets an operator reuse an existing id or introduce a new one
 * without leaving the field.
 */
export function Combobox({
  name,
  value,
  onChange,
  options,
  placeholder,
  testId,
  ariaInvalid,
  ariaDescribedBy,
  ariaRequired,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Case-insensitive contains match; an empty box shows the whole list.
  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, value]);

  // Offer to add the typed value only when it is not already a known option.
  const typed = value.trim();
  const showCreate =
    typed !== "" &&
    !options.some((option) => option.toLowerCase() === typed.toLowerCase());

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (open && active >= 0 && active < matches.length) {
        event.preventDefault();
        commit(matches[active]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="combobox" ref={rootRef}>
      <input
        type="text"
        name={name}
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        autoComplete="off"
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (matches.length > 0 || showCreate) && (
        <ul className="combobox-list" role="listbox" id={listId}>
          {matches.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={index === active ? "combobox-option active" : "combobox-option"}
              // Use onMouseDown so the pick lands before the input blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                commit(option);
              }}
            >
              {option}
            </li>
          ))}
          {showCreate && (
            <li
              role="option"
              aria-selected={false}
              className="combobox-option combobox-create"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(typed);
              }}
            >
              <span className="combobox-create-label">새로 추가</span> “{typed}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
