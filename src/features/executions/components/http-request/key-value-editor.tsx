"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KeyValueEntry } from "./types";

type KeyValueEditorProps = {
  label: string;
  entries: KeyValueEntry[];
  onChange: (entries: KeyValueEntry[]) => void;
  helperText: string;
};

const createEntry = (): KeyValueEntry => ({
  id: crypto.randomUUID(),
  key: "",
  value: "",
});

export const KeyValueEditor = ({
  label,
  entries,
  onChange,
  helperText,
}: KeyValueEditorProps) => {
  const updateEntry = (
    entryId: string,
    field: "key" | "value",
    value: string,
  ) => {
    onChange(
      entries.map((entry) =>
        entry.id === entryId ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange([...entries, createEntry()])}
        >
          <PlusIcon />
          Add
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <div key={entry.id} className="flex items-center gap-2">
              <Input
                value={entry.key}
                aria-label={`${label} key ${index + 1}`}
                placeholder="Key"
                onChange={(event) =>
                  updateEntry(entry.id, "key", event.target.value)
                }
              />
              <Input
                value={entry.value}
                aria-label={`${label} value ${index + 1}`}
                placeholder="Value"
                onChange={(event) =>
                  updateEntry(entry.id, "value", event.target.value)
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${label.toLowerCase()} row ${index + 1}`}
                onClick={() =>
                  onChange(entries.filter(({ id }) => id !== entry.id))
                }
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-muted-foreground">{helperText}</p>
    </div>
  );
};
