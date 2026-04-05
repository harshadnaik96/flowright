"use client"

import Link from "next/link"
import { Plus, Sparkles } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api"
import type { Project } from "@flowright/shared"
import { useState, useEffect } from "react"
import { motion, Variants } from "framer-motion"

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProjects() {
      try {
        const data = await api.projects.list()
        setProjects(data)
      } catch {
        setProjects([])
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    },
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-400">Projects</h1>
          <p className="text-muted-foreground text-base mt-2">
            Select a project to manage flows and run tests.
          </p>
        </motion.div>
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 24 }}
        >
          <Link href="/projects/new">
            <Button size="lg" className="rounded-full shadow-lg hover:shadow-indigo-500/25 transition-all">
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </Link>
        </motion.div>
      </div>

      {!loading && projects.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
          className="flex flex-col items-center justify-center rounded-2xl border border-indigo-100 bg-white/50 backdrop-blur-sm p-24 text-center shadow-sm"
        >
          <div className="bg-indigo-50 p-4 rounded-full mb-6">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h3 className="font-semibold text-xl text-foreground">A Fresh Canvas</h3>
          <p className="text-muted-foreground mt-2 mb-8 max-w-sm">
            Create your first project to start writing test flows and watch the magic happen.
          </p>
          <Link href="/projects/new">
            <Button size="lg" className="rounded-full shadow-md">
              <Plus className="h-4 w-4 mr-2" /> Create First Project
            </Button>
          </Link>
        </motion.div>
      ) : (
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {loading ? (
             Array.from({ length: 3 }).map((_, i) => (
               <div key={i} className="h-40 rounded-2xl bg-indigo-50/50 animate-pulse border border-indigo-100" />
             ))
          ) : (
            projects.map((project) => (
              <motion.div key={project.id} variants={item} whileHover={{ y: -4 }}>
                <Link href={`/projects/${project.id}`} className="block h-full">
                  <Card className="h-full bg-white/70 backdrop-blur-md border-indigo-100 hover:border-primary/40 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 rounded-2xl group overflow-hidden">
                    <CardHeader>
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">{project.name}</CardTitle>
                      {project.description && (
                        <CardDescription className="line-clamp-2 mt-2">{project.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center text-xs text-indigo-400 font-medium bg-indigo-50 w-fit px-3 py-1 rounded-full">
                        Created {new Date(project.createdAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))
          )}
        </motion.div>
      )}
    </AppShell>
  )
}
