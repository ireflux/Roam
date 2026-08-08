"use client";

import { useEffect, useRef, useState } from "react";

interface Poi { name: string; address: string; lng: number; lat: number }

interface SearchBoxProps {
  onPick: (name: string, lng: number, lat: number) => void;
  autoFocus?: boolean;
  onBlur?: () => void;
  /** 聚焦状态上报（移动端：聚焦时工具行收起） */
  onFocusChange?: (focused: boolean) => void;
}

export default function SearchBox({ onPick, autoFocus, onBlur, onFocusChange }: SearchBoxProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Poi[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const keyword = q.trim();
    if (keyword.length < 2) return;
    const controller = new AbortController();
    debounceRef.current = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(keyword)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ pois: Poi[] }> : { pois: [] })
        .then((data) => { setResults(data.pois ?? []); setOpen(true); })
        .catch(() => { if (!controller.signal.aborted) setResults([]); });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [q]);

  const setFocus = (v: boolean) => {
    if (!v) onBlur?.();
    onFocusChange?.(v);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={q}
        onChange={(event) => {
          const value = event.target.value;
          setQ(value);
          if (value.trim().length < 2) { setResults([]); setOpen(false); }
        }}
        onFocus={() => { setFocus(true); if (results.length > 0) setOpen(true); }}
        onBlur={() => setFocus(false)}
        placeholder="搜索地点…（如：外滩）"
        className="w-full rounded-full border border-zinc-200 bg-white py-2.5 pl-4 pr-4 text-sm shadow outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((poi) => (
            <li key={`${poi.lng},${poi.lat},${poi.name}`}>
              <button
                className="flex min-h-12 w-full flex-col px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => { onPick(poi.name, poi.lng, poi.lat); setQ(""); setResults([]); setOpen(false); (document.activeElement as HTMLElement)?.blur(); setFocus(false); }}
              >
                <span className="text-sm font-medium">{poi.name}</span>
                <span className="text-xs text-zinc-400">{poi.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}