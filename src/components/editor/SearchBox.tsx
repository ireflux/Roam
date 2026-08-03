"use client";

import { useEffect, useRef, useState } from "react";

interface PhotonFeature {
  properties: {
    name?: string;
    osm_value?: string;
    city?: string;
    country?: string;
    housenumber?: string;
    street?: string;
  };
  geometry: { coordinates: [number, number] };
}

export default function SearchBox({ onPick }: { onPick: (name: string, lng: number, lat: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 输入清空时同步清空结果列表
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&limit=6&lang=zh`,
        );
        const json = (await res.json()) as { features: PhotonFeature[] };
        setResults(json.features ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="搜索地点…（如：外滩）"
        className="w-full rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-11 z-20 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((f, i) => (
            <li key={i}>
              <button
                className="flex w-full flex-col px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  const { name, city, country } = f.properties;
                  const label = [name, city, country].filter(Boolean).join(" · ") || "未命名地点";
                  onPick(label, f.geometry.coordinates[0], f.geometry.coordinates[1]);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="text-sm font-medium">{f.properties.name || "未命名地点"}</span>
                <span className="text-xs text-zinc-400">
                  {[f.properties.city, f.properties.country].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
