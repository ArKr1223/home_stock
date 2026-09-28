import { ChevronDown } from 'lucide-react';

export function MultiFilter({ label, values, selected, onChange }: { label: string; values: string[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  return <details className="filter-menu">
    <summary>{selected.size ? `${label} ${selected.size}` : `全部${label}`}<ChevronDown size={15} /></summary>
    <div className="filter-popover">
      {values.length ? values.map((value) => <label key={value}>
        <input type="checkbox" checked={selected.has(value)} onChange={() => {
          const next = new Set(selected); if (next.has(value)) next.delete(value); else next.add(value); onChange(next);
        }} />{value}
      </label>) : <span>尚無選項</span>}
      {selected.size ? <button className="text-button" onClick={() => onChange(new Set())}>清除選取</button> : null}
    </div>
  </details>;
}
