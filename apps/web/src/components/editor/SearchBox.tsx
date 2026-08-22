"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

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
      <div className="relative flex items-center">
        <Search size={16} className="pointer-events-none absolute left-4 text-faint" aria-hidden />
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
          className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-9 text-sm text-ink shadow-sm placeholder:text-faint transition-interact outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        {q && (
          <button
            onClick={() => { setQ(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            aria-label="清空搜索"
            title="清空"
            className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full text-faint transition-interact hover:bg-surface-soft hover:text-muted"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="anim-scale-in absolute left-0 right-0 top-full z-30 mt-2 max-h-80 origin-top overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-float">
          {results.map((poi) => (
            <li key={`${poi.lng},${poi.lat},${poi.name}`}>
              <button
                className="flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-interact hover:bg-brand-soft/60"
                onClick={() => { onPick(poi.name, poi.lng, poi.lat); setQ(""); setResults([]); setOpen(false); (document.activeElement as HTMLElement)?.blur(); setFocus(false); }}
              >
                <MapPin size={16} className="mt-1 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{poi.name}</span>
                  {poi.address && <span className="mt-0.5 block truncate text-xs text-faint">{poi.address}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}