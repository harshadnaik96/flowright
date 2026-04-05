'use client';

import React, { useEffect, useState } from 'react';
import { TocEntry } from '@/lib/docs';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function TableOfContents({ toc }: { toc: TocEntry[] }) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const ob = new IntersectionObserver(
      (entries) => {
        const visibleElements = entries.filter((entry) => entry.isIntersecting);
        if (visibleElements.length > 0) {
          // Find the one closest to the top
          // Sort by top boundary
          visibleElements.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveId(visibleElements[0].target.id);
        }
      },
      { rootMargin: '0px 0px -80% 0px' }
    );

    const elements = document.querySelectorAll('h2, h3');
    elements.forEach((elem) => ob.observe(elem));

    return () => ob.disconnect();
  }, []);

  if (!toc.length) return null;

  return (
    <div className="space-y-4 py-2">
      <h3 className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/35 antialiased">
        On This Page
      </h3>
      <ul className="space-y-2.5 text-[12px] border-l border-border/20 ml-1">
        {toc.map((entry) => (
          <li
            key={entry.id}
            className="relative"
            style={{ paddingLeft: `${(entry.level - 2) * 0.75 + 0.75}rem` }}
          >
            {activeId === entry.id && (
              <div className="absolute -left-px top-1 bottom-1 w-0.5 bg-primary/60 rounded-full transition-all duration-300" />
            )}
            <Link
              href={`#${entry.id}`}
              className={cn(
                "block transition-all duration-200 hover:text-foreground",
                activeId === entry.id
                  ? 'text-foreground font-bold'
                  : 'text-muted-foreground/50 font-medium'
              )}
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
