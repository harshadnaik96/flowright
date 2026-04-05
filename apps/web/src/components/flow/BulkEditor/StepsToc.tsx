"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { FlowStep } from "@flowright/shared";

type Props = {
  steps: FlowStep[];
  activeOrder: number | null;
  onStepClick: (order: number) => void;
};

export const StepsToc = ({ steps, activeOrder, onStepClick }: Props) => {
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeOrder]);

  return (
    <div className="flex flex-col gap-1.5 p-3">
      {steps.map((step) => {
        const isActive = step.order === activeOrder;
        return (
          <button
            key={step.id}
            ref={isActive ? activeRowRef : null}
            onClick={() => onStepClick(step.order)}
            aria-label={`Go to step ${step.order}: ${step.plainEnglish}`}
            className={cn(
              "flex items-center gap-4 rounded-xl px-4 py-3.5 text-left text-sm transition-all duration-300 w-full relative group",
              isActive
                ? "bg-primary/[0.03] border border-primary/[0.08] shadow-[0_8px_20px_-12px_rgba(99,102,241,0.12)]"
                : "text-muted-foreground/60 hover:bg-secondary/40 hover:text-foreground/80"
            )}
          >
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition-all duration-300",
                isActive
                  ? "bg-primary/10 border border-primary/20 text-primary scale-110 shadow-sm shadow-primary/5"
                  : "bg-muted/30 text-muted-foreground/40 group-hover:bg-muted/50 group-hover:text-muted-foreground/60 group-hover:scale-105"
              )}
            >
              {step.order}
            </div>
            <div className="flex-1 min-w-0 pr-4">
              <span 
                className={cn(
                  "leading-relaxed line-clamp-2 block transition-colors duration-300",
                  isActive ? "text-foreground/90 font-medium" : "font-normal"
                )}
              >
                {step.plainEnglish}
              </span>
            </div>
            {isActive && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary/30 animate-pulse ring-4 ring-primary/5" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
