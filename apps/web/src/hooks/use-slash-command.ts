import { useState } from "react";
import type { SlashCommand } from "@/hooks/use-commands";

export type TriggerType = "slash" | "bang" | null;

export interface UseSlashCommandResult {
  isOpen: boolean;
  trigger: TriggerType;
  searchQuery: string;
  selectedIndex: number;
  startIndex: number | null;
  handleInputChange: (
    value: string,
    cursorPosition: number,
    commands: SlashCommand[],
  ) => void;
  handleKeyDown: (e: React.KeyboardEvent, count: number) => boolean;
  handleSelect: (value: string, currentValue: string) => string;
  close: () => void;
  setSelectedIndex: (index: number) => void;
}

export function useSlashCommand(): UseSlashCommandResult {
  const [isOpen, setIsOpen] = useState(false);
  const [trigger, setTrigger] = useState<TriggerType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [startIndex, setStartIndex] = useState<number | null>(null);

  const handleInputChange = (
    value: string,
    cursorPosition: number,
    commands: SlashCommand[],
  ) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastLineStart = textBeforeCursor.lastIndexOf("\n") + 1;
    const lineStartText = textBeforeCursor.slice(lastLineStart);

    const slashIndex = lineStartText.indexOf("/");
    const bangIndex = lineStartText.indexOf("!");

    const isLineStart =
      lastLineStart === 0 ||
      (lastLineStart > 0 && value[lastLineStart - 1] === "\n");

    let detected: TriggerType = null;
    let triggerIndex = -1;

    if (
      isLineStart &&
      slashIndex === 0 &&
      !lineStartText.includes(" ") &&
      commands.length > 0
    ) {
      detected = "slash";
      triggerIndex = lastLineStart;
    } else if (
      isLineStart &&
      bangIndex === 0 &&
      !lineStartText.includes(" ")
    ) {
      detected = "bang";
      triggerIndex = lastLineStart;
    }

    if (detected && triggerIndex !== -1) {
      const query = lineStartText.slice(1);
      setTrigger(detected);
      setSearchQuery(query);
      setStartIndex(triggerIndex);
      setSelectedIndex(0);
      setIsOpen(true);
      return;
    }

    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent, count: number): boolean => {
    if (!isOpen) return false;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(count, 1));
        return true;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev - 1 < 0 ? Math.max(count - 1, 0) : prev - 1,
        );
        return true;
      case "Escape":
        e.preventDefault();
        close();
        return true;
      case "Tab":
      case "Enter":
        if (count > 0) {
          e.preventDefault();
          return true;
        }
        return false;
      default:
        return false;
    }
  };

  const handleSelect = (value: string, currentValue: string): string => {
    if (startIndex === null) return currentValue;

    const prefix = currentValue.slice(0, startIndex);
    const after = currentValue.slice(startIndex + 1 + searchQuery.length);
    const newValue = `${prefix}${value} ${after}`;

    close();
    return newValue;
  };

  const close = () => {
    setIsOpen(false);
    setTrigger(null);
    setSearchQuery("");
    setStartIndex(null);
    setSelectedIndex(0);
  };

  return {
    isOpen,
    trigger,
    searchQuery,
    selectedIndex,
    startIndex,
    handleInputChange,
    handleKeyDown,
    handleSelect,
    close,
    setSelectedIndex,
  };
}
