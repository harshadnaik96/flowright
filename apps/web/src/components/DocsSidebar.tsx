'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocItem } from '@/lib/docs';
import { ChevronRight, ChevronDown, Menu, X, ChevronLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

function SidebarItem({ item, depth = 0, currentPath }: { item: DocItem; depth?: number; currentPath: string }) {
  const [isOpen, setIsOpen] = useState(true);
  const paddingLeft = depth > 0 ? `${depth * 0.75 + 0.5}rem` : '0.5rem';
  
  if (item.isDir && item.children) {
    return (
      <div className="mb-0.5">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full text-left font-medium text-[13px] text-foreground/70 hover:text-foreground py-1 px-3 rounded-lg hover:bg-secondary/40 transition-all group"
          style={{ paddingLeft }}
        >
          <span>{item.title}</span>
          <div className="rounded-md transition-colors opacity-30 group-hover:opacity-80">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        </button>
        {isOpen && (
          <div className="flex flex-col mt-0.5">
            {item.children.map((child) => (
              <SidebarItem key={child.slug.join('-')} item={child} depth={depth + 1} currentPath={currentPath} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const href = `/docs/${item.slug.join('/')}`;
  const isActive = currentPath === href;

  return (
    <Link 
      href={href}
      className={cn(
        "relative flex items-center text-[13px] py-1.5 px-3 rounded-lg transition-all duration-200 group mx-2",
        isActive 
          ? "bg-primary/[0.06] text-primary font-semibold shadow-sm" 
          : "text-muted-foreground/60 hover:text-foreground/90 hover:bg-secondary/30 font-medium"
      )}
      style={{ paddingLeft: `calc(${paddingLeft} - 0.25rem)` }}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary/60 rounded-full" />
      )}
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

export function DocsSidebar({ docs }: { docs: DocItem[] }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Toggle */}
      <div className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40 px-5 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(79,70,229,0.3)]" />
          <span className="tracking-tight">Flowright Docs</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1.5 text-foreground/70 bg-muted/20 rounded-lg">
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Sidebar background overlay for mobile */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/40 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border/40 transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-60 md:shrink-0 overflow-y-auto custom-scrollbar flex flex-col
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="py-6 flex flex-col flex-1">
          {/* Back to Portal Dashboard Link */}
          <Link href="/" className="group flex items-center gap-2 px-6 mb-4 text-[12px] font-semibold text-muted-foreground/60 hover:text-primary transition-all">
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
          
          <nav className="flex flex-col gap-0.5 px-2">
            {docs.map((doc, idx) => (
              <React.Fragment key={doc.slug.join('-')}>
                {/* Visual Separator after index 5 (Technical vs User Guide) */}
                {idx === 5 && (
                  <div className="my-4 mx-4 flex items-center gap-2 opacity-30">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference</span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                )}
                <SidebarItem item={doc} currentPath={pathname} />
              </React.Fragment>
            ))}
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
