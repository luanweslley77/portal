import { useLayoutEffect, useMemo, useState } from "react";
import type { SlashCommand } from "@/hooks/use-commands";
import type { TriggerType } from "@/hooks/use-slash-command";

interface PopoverPosition {
  bottom: number;
  left: number;
  width: number;
}

interface CommandPopoverProps {
  isOpen: boolean;
  trigger: TriggerType;
  searchQuery: string;
  selectedIndex: number;
  commands: SlashCommand[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  onSelect: (value: string) => void;
  onSelectedIndexChange: (index: number) => void;
}

export function CommandPopover({
  isOpen,
  trigger,
  searchQuery,
  selectedIndex,
  commands,
  textareaRef,
  onClose,
  onSelect,
  onSelectedIndexChange,
}: CommandPopoverProps) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || trigger === null) return;
    const compute = () => {
      const textareaRect = textareaRef.current?.getBoundingClientRect();
      if (!textareaRect) return;
      setPosition({
        bottom: Math.max(window.innerHeight - textareaRect.top + 10, 8),
        left: Math.max(
          Math.min(textareaRect.left, window.innerWidth - 280),
          8,
        ),
        width: textareaRect.width,
      });
    };
    compute();
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", compute);
    visualViewport?.addEventListener("resize", compute);
    visualViewport?.addEventListener("scroll", compute);
    document.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      visualViewport?.removeEventListener("resize", compute);
      visualViewport?.removeEventListener("scroll", compute);
      document.removeEventListener("scroll", compute, true);
    };
  }, [isOpen, trigger, textareaRef]);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (trigger === "slash") {
      return commands.filter(
        (command) =>
          command.name.toLowerCase().includes(query) ||
          (command.description ?? "").toLowerCase().includes(query),
      );
    }
    return [];
  }, [commands, searchQuery, trigger]);

  const items =
    trigger === "slash"
      ? filtered.map((command) => ({ value: `/${command.name}`, command }))
      : [{ value: `!`, command: undefined }];

  if (!isOpen || trigger === null) return null;

  const style: React.CSSProperties | undefined = position
    ? {
        position: "fixed",
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      className="box-border rounded-lg border border-ring/70 bg-bg shadow-2xl overflow-hidden ring-3 ring-ring/20"
      style={style}
    >
      <div className="max-h-56 overflow-y-auto p-1.5 scrollbar-hide">
        {trigger === "bang" && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect("!")}
          >
            <span className="text-primary font-mono font-bold">!</span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="font-medium truncate">Shell command</span>
              <span className="text-[10px] truncate text-muted-fg/70">
                Run a bash command directly
              </span>
            </span>
          </button>
        )}

        {trigger === "slash" &&
          items.map((item, index) => (
            <button
              type="button"
              key={item.value}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-all duration-150 ${
                index === selectedIndex
                  ? "bg-primary/10 text-primary-fg"
                  : "hover:bg-muted/50 active:bg-muted/70 text-foreground"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item.value)}
              onMouseEnter={() => onSelectedIndexChange(index)}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${
                  index === selectedIndex
                    ? "bg-primary text-primary-fg"
                    : "bg-muted text-muted-fg"
                }`}
              >
                /{item.command?.name ?? ""}
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span
                  className={`truncate leading-tight ${
                    index === selectedIndex
                      ? "text-primary-fg"
                      : "text-foreground"
                  }`}
                >
                  {item.command?.name ?? ""}
                </span>
                <span
                  className={`text-[10px] truncate leading-tight ${
                    index === selectedIndex
                      ? "text-primary-fg/70"
                      : "text-muted-fg/70"
                  }`}
                >
                  {item.command?.description ?? ""}
                </span>
              </span>
            </button>
          ))}

        {trigger === "slash" && items.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-fg/60">
            No commands found
          </div>
        )}
      </div>
    </div>
  );
}
