'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth/api';
import type { Category } from '@/lib/admin/types';
import { errorMessage } from '@/lib/format';

type Props = {
  options: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Chamado quando uma categoria nova é criada via inline create. */
  onCreated?: (category: Category) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Multi-select pesquisável com criação inline.
 * Usa POST /categories quando o texto digitado ainda não existe.
 */
export function CategoryMultiSelect({
  options,
  value,
  onChange,
  onCreated,
  disabled,
  placeholder = 'Buscar ou criar categoria…',
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => options.filter((c) => value.includes(c.id)), [options, value]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((c) => !value.includes(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [options, value, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return options.find((c) => c.name.toLowerCase() === q) ?? null;
  }, [options, query]);

  const canCreate = query.trim().length > 0 && !exactMatch && !busy && !disabled;

  const menuItems = useMemo(() => {
    const items: Array<{ kind: 'option'; category: Category } | { kind: 'create'; name: string }> =
      available.map((category) => ({ kind: 'option', category }));
    if (canCreate) {
      items.push({ kind: 'create', name: query.trim() });
    }
    return items;
  }, [available, canCreate, query]);

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

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function select(id: string) {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  async function createCategory(name: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      onCreated?.(created);
      onChange([...value, created.id]);
      setQuery('');
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível criar a categoria'));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(menuItems.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Backspace' && !query && selected.length) {
      remove(selected[selected.length - 1].id);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = menuItems[highlight];
      if (!item) return;
      if (item.kind === 'option') select(item.category.id);
      else void createCategory(item.name);
    }
  }

  return (
    <div className="multi-select" ref={rootRef}>
      <div
        className={`multi-select-control${disabled ? ' is-disabled' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="tag-list">
          {selected.map((c) => (
            <span key={c.id} className="badge badge-brand multi-select-chip">
              {c.name}
              {!disabled ? (
                <button
                  type="button"
                  className="multi-select-chip-remove"
                  aria-label={`Remover ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(c.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          placeholder={selected.length ? '' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && !disabled ? (
        <ul id={listId} className="multi-select-menu" role="listbox">
          {menuItems.length === 0 ? (
            <li className="multi-select-empty">Nenhuma categoria encontrada</li>
          ) : (
            menuItems.map((item, index) =>
              item.kind === 'option' ? (
                <li key={item.category.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={index === highlight ? 'is-active' : undefined}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => select(item.category.id)}
                  >
                    {item.category.name}
                  </button>
                </li>
              ) : (
                <li key={`create-${item.name}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={`multi-select-create${index === highlight ? ' is-active' : ''}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => void createCategory(item.name)}
                    disabled={busy}
                  >
                    Criar «{item.name}»
                  </button>
                </li>
              ),
            )
          )}
        </ul>
      ) : null}

      {error ? (
        <p className="hint" style={{ color: 'var(--danger)', marginTop: '0.35rem' }}>
          {error}
        </p>
      ) : (
        <p className="hint">
          Digite para buscar. Se a categoria não existir, use Enter para criá-la.
        </p>
      )}
    </div>
  );
}
