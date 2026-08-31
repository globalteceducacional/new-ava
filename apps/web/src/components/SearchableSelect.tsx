'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

export type SearchableOption = {
  id: string;
  label: string;
  /** Texto auxiliar (e-mail, username…) — também entra na busca. */
  secondary?: string;
};

type Props = {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
};

/**
 * Select único com campo digitável para filtrar opções (professores, alunos, etc.).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  disabled,
  emptyMessage = 'Nenhum resultado',
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Mantém o texto do input alinhado ao valor selecionado quando não está buscando.
  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? '');
    }
  }, [selected, open, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Com item selecionado e texto igual ao rótulo, mostra a lista completa.
    if (selected && query === selected.label) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.secondary ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, selected]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(id: string) {
    onChange(id);
    const opt = options.find((o) => o.id === id);
    setQuery(opt?.label ?? '');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selected?.label ?? '');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlight];
      if (item) select(item.id);
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <div className={`searchable-select-control${disabled ? ' is-disabled' : ''}`}>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="searchable-select-clear"
            aria-label="Limpar seleção"
            disabled={disabled}
            onClick={clear}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <ul id={listId} className="searchable-select-menu" role="listbox">
          {filtered.length === 0 ? (
            <li className="searchable-select-empty">{emptyMessage}</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight || item.id === value}
                  className={index === highlight || item.id === value ? 'is-active' : undefined}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(item.id)}
                >
                  <span className="searchable-select-label">{item.label}</span>
                  {item.secondary ? (
                    <span className="searchable-select-secondary">{item.secondary}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
