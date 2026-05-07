'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type DocItem } from '@/lib/docs';
import { Menu, X, ChevronLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

type NavLinkProps = {
  item: DocItem
  currentPath: string
}

function NavLink({ item, currentPath }: NavLinkProps) {
  const href = `/docs/${item.slug.join('/')}`;
  const isActive = currentPath === href;

  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center text-[13px] py-1.5 px-3 rounded-lg transition-all duration-200 mx-2",
        isActive
          ? "bg-primary/[0.06] text-primary font-semibold shadow-sm"
          : "text-muted-foreground/60 hover:text-foreground/90 hover:bg-secondary/30 font-medium"
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary/60 rounded-full" />
      )}
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

type SectionProps = {
  item: DocItem
  currentPath: string
  isFirst: boolean
}

function SidebarSection({ item, currentPath, isFirst }: SectionProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", !isFirst && "mt-5")}>
      <p className="px-5 mb-1 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">
        {item.title}
      </p>
      {item.children?.map((child) => (
        <NavLink key={child.slug.join('-')} item={child} currentPath={currentPath} />
      ))}
    </div>
  );
}

type DocsSidebarProps = {
  docs: DocItem[]
}

export function DocsSidebar({ docs }: DocsSidebarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40 px-5 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(79,70,229,0.3)]" />
          <span className="tracking-tight">Flowright Docs</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-foreground/70 bg-muted/20 rounded-lg"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border/40 transform transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar flex flex-col",
        "md:translate-x-0 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-60 md:shrink-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="py-6 flex flex-col flex-1">
          <Link
            href="/"
            className="group flex items-center gap-2 px-6 mb-4 text-[12px] font-semibold text-muted-foreground/60 hover:text-primary transition-all"
          >
            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Portal</span>
          </Link>

          <div className="mx-6 h-px bg-border/40 mb-6" />

          <Link href="/docs" className="group flex items-center gap-2 px-6 mb-5 hover:opacity-80 transition-opacity">
            <div className="w-4 h-4 flex items-center justify-center bg-primary rounded shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-[8px] text-white font-black leading-none uppercase">FR</span>
            </div>
            <span className="font-bold text-[15px] tracking-tight text-foreground">Documentation</span>
          </Link>

          <nav className="flex flex-col px-2">
            {docs.map((section, idx) =>
              section.isDir ? (
                <SidebarSection
                  key={section.slug.join('-')}
                  item={section}
                  currentPath={pathname}
                  isFirst={idx === 0}
                />
              ) : (
                <NavLink key={section.slug.join('-')} item={section} currentPath={pathname} />
              )
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-border/20 mt-auto bg-muted/[0.03]">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/10">
            <span className="text-[11px] font-medium text-muted-foreground/60">Appearance</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
