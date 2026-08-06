"use client";

import { useEffect, useRef, useState } from "react";

interface Poi { name: string; address: string; lng: number; lat: number }

export default function SearchBox({ onPick }: { onPick: (name: string, lng: number, lat: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Poi[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return <div className="relative"><input value={q} onChange={(event) => { const value = event.target.value; setQ(value); if (value.trim().length < 2) { setResults([]); setOpen(false); } }} onFocus={() => results.length > 0 && setOpen(true)} placeholder="搜索地点…（如：外滩）" className="w-full rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow outline-none focus:border-emerald-500" />{open && results.length > 0 && <ul className="absolute left-0 right-0 top-11 z-20 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">{results.map((poi) => <li key={`${poi.lng},${poi.lat},${poi.name}`}><button className="flex w-full flex-col px-4 py-2 text-left hover:bg-zinc-100" onClick={() => { onPick(poi.name, poi.lng, poi.lat); setQ(""); setResults([]); setOpen(false); }}><span className="text-sm font-medium">{poi.name}</span><span className="text-xs text-zinc-400">{poi.address}</span></button></li>)}</ul>}</div>;
}