"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FlaskConical, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group transition-all">
              <div className="bg-primary/10 p-1.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
              <span className="font-bold text-lg tracking-tight">Flowright</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  pathname === "/" || pathname.startsWith("/projects")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                Projects
              </Link>
              <Link
                href="/docs"
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  pathname.startsWith("/docs")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                Docs
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-2">
            <Link
              href="/settings/agent"
              className={cn(
                "p-2 rounded-full transition-all",
                pathname.startsWith("/settings")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  )
}
