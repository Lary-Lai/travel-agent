"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_CHIP_LENGTH, normaliseChips } from "@/lib/profile-options";
import { cn } from "@/lib/utils";

type ChipListEditorProps = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  placeholder: string;
  suggestions: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  /** "tile" gives the visited-places showcase a roomier, stamp-like look. */
  variant?: "chip" | "tile";
  emptyText: string;
};

/**
 * Editor for one list of short free-text values (tags, hobbies, destinations…).
 *
 * Used four times on the profile page, so the interaction is defined once:
 * type + Enter to add, click a suggestion to toggle it, and remove with the × on
 * a chip (or Backspace on an empty input, which is the behaviour people expect
 * from a tag field).
 */
export function ChipListEditor({
  id,
  label,
  icon: Icon,
  hint,
  placeholder,
  suggestions,
  values,
  onChange,
  max,
  variant = "chip",
  emptyText,
}: ChipListEditorProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const full = values.length >= max;

  const commit = (raw: string) => {
    const next = normaliseChips([...values, raw], max);
    // normaliseChips returns the same values when the input was a duplicate, so
    // only clear the box when something was actually added.
    if (next.length !== values.length) {
      onChange(next);
      setDraft("");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "，") {
      event.preventDefault();
      if (draft.trim()) commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && values.length > 0) {
      event.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  const unselected = suggestions.filter((item) => !values.includes(item));

  return (
    <section className="space-y-2.5" id={id}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${id}-input`} className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="text-primary size-3.5" />
          {label}
        </Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {values.length} / {max}
        </span>
      </div>

      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

      {values.length > 0 ? (
        <ul className={cn("flex flex-wrap gap-1.5", variant === "tile" && "gap-2")}>
          {values.map((value) => (
            <li key={value}>
              <span
                className={cn(
                  "bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full font-medium",
                  variant === "tile" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
                )}
              >
                {value}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((item) => item !== value))}
                  aria-label={`移除 ${value}`}
                  className="hover:text-destructive -mr-0.5 rounded-full transition-colors"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground/70 text-xs">{emptyText}</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          id={`${id}-input`}
          ref={inputRef}
          value={draft}
          maxLength={MAX_CHIP_LENGTH}
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={full ? `已达上限 ${max} 项` : placeholder}
          className="h-8 text-sm"
        />
        <button
          type="button"
          disabled={full || !draft.trim()}
          onClick={() => commit(draft)}
          aria-label={`添加${label}`}
          className="border-input hover:bg-accent inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {!full && unselected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {unselected.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(normaliseChips([...values, suggestion], max))}
              className="text-muted-foreground hover:border-primary hover:text-foreground rounded-full border border-dashed px-2.5 py-1 text-xs transition-colors"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
