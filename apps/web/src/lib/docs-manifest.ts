export type NavItem = {
  title: string
  slug: string[]
}

export type NavSection = {
  title: string
  items: NavItem[]
}

export const DOCS_NAV: NavSection[] = [
  {
    title: "User Guide",
    items: [
      { title: "What is Flowright?",  slug: ["user-guide", "stage-0-overview"] },
      { title: "Getting Started",    slug: ["user-guide", "stage-1-getting-started"] },
      { title: "Crawling Your App",  slug: ["user-guide", "stage-2-crawler"] },
      { title: "Generating Flows",   slug: ["user-guide", "stage-3-generator"] },
      { title: "Reviewing & Editing",slug: ["user-guide", "stage-4-ui"] },
      { title: "Running Flows",      slug: ["user-guide", "stage-5-runner"] },
      { title: "Prerequisite Flows", slug: ["user-guide", "stage-6-prerequisite-flows"] },
    ],
  },
  {
    title: "Technical Reference",
    items: [
      { title: "Design Philosophy",     slug: ["technical", "stage-0-design-philosophy"] },
      { title: "Architecture Overview", slug: ["technical", "stage-1-architecture"] },
      { title: "Crawler",               slug: ["technical", "stage-2-crawler"] },
      { title: "AI Generator",          slug: ["technical", "stage-3-generator"] },
      { title: "User Interface",        slug: ["technical", "stage-4-ui"] },
      { title: "Test Runner",           slug: ["technical", "stage-5-runner"] },
      { title: "Self-Heal",             slug: ["technical", "stage-6-self-heal"] },
      { title: "Prerequisite Flows",    slug: ["technical", "stage-7-prerequisite-flows"] },
    ],
  },
]
