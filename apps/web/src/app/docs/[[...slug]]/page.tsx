import { getDocBySlug, getFlatDocs, getTableOfContents } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { TableOfContents } from "@/components/TableOfContents";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronRightIcon } from "lucide-react";

export async function generateMetadata(props: {
  params: Promise<{ slug: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug || [];

  if (slug.length === 0) {
    return { title: "Documentation | Flowright" };
  }

  const doc = getDocBySlug(slug);
  if (!doc) {
    return { title: "Doc Not Found" };
  }

  return { title: `${doc.title} | Flowright Docs` };
}

export default async function DocPage(props: {
  params: Promise<{ slug: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug || [];

  if (slug.length === 0) {
    return (
      <div className='max-w-5xl mx-auto px-8 lg:px-12 py-10 lg:py-16'>
        <header className='mb-12'>
          <h1 className='text-3xl md:text-4xl font-black tracking-tightest text-foreground mb-4'>
            Welcome to Flowright
          </h1>
          <p className='text-lg text-foreground/50 max-w-2xl leading-relaxed font-semibold'>
            Orchestrate high-fidelity Cypress suites with a{" "}
            <span className='text-primary font-bold'>
              Gemini-powered agentic pipeline
            </span>
            . Automate visual discovery, generate resilient flows, and execute
            with surgical precision.
          </p>
        </header>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6'>
          {[
            {
              title: "What is Flowright?",
              desc: "The problem it solves, the mental model, and what it is not.",
              href: "/docs/user-guide/stage-0-overview",
            },
            {
              title: "Getting Started",
              desc: "Set up Flowright for your team and run your first test.",
              href: "/docs/user-guide/stage-1-getting-started",
            },
            {
              title: "Design Philosophy",
              desc: "Why LLM-driven generation, why the crawler exists, and the tradeoffs made deliberately.",
              href: "/docs/technical/stage-0-design-philosophy",
            },
            {
              title: "Architecture Overview",
              desc: "The full stack: monorepo structure, database schema, API routes, and runtime execution.",
              href: "/docs/technical/stage-1-architecture",
            },
          ].map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className='group flex flex-col p-6 rounded-xl border border-border/40 bg-card hover:border-primary/20 hover:bg-primary/[0.01] transition-all duration-300'
            >
              <h3 className='text-base font-bold text-foreground mb-2 group-hover:text-primary transition-colors'>
                {card.title}
              </h3>
              <p className='text-[13px] text-muted-foreground leading-relaxed mb-6 flex-1'>
                {card.desc}
              </p>
              <div className='flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary/40 group-hover:text-primary transition-all'>
                <span>Learn more</span>
                <ChevronRight
                  size={10}
                  className='group-hover:translate-x-0.5 transition-transform'
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const doc = getDocBySlug(slug);

  if (!doc) {
    return notFound();
  }

  const flatDocs = getFlatDocs();
  const currentIndex = flatDocs.findIndex(
    (d) => d.slug.join("/") === slug.join("/"),
  );
  const prevDoc = currentIndex > 0 ? flatDocs[currentIndex - 1] : null;
  const nextDoc =
    currentIndex !== -1 && currentIndex < flatDocs.length - 1
      ? flatDocs[currentIndex + 1]
      : null;

  const toc = getTableOfContents(doc.content);

  return (
    <div className='flex xl:gap-16 max-w-[1440px] mx-auto px-6 lg:px-10 py-8'>
      <div className='flex-1 min-w-0 max-w-4xl'>
        <nav className='flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 mb-8'>
          <Link href='/docs' className='hover:text-primary transition-all'>
            Docs
          </Link>
          {slug.map((part, index) => {
            const isLast = index === slug.length - 1;
            const href = `/docs/${slug.slice(0, index + 1).join("/")}`;
            return (
              <div key={part} className='flex items-center'>
                <ChevronRightIcon size={10} className='mx-2 opacity-30' />
                {isLast ? (
                  <span className='text-foreground/30 truncate max-w-[120px]'>
                    {doc.title}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className='hover:text-primary transition-all'
                  >
                    {part.replace(/-/g, " ")}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        <header className='mb-10 border-b border-border/40 pb-6'>
          <h1 className='text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-2 leading-tight'>
            {doc.title}
          </h1>
          {doc.frontmatter.description ? (
            <p className='text-[15px] text-foreground/60 leading-relaxed max-w-3xl font-medium tracking-tight'>
              {doc.frontmatter.description}
            </p>
          ) : (
            <p className='text-[15px] text-foreground/40 leading-relaxed max-w-3xl font-medium italic tracking-tight'>
              A comprehensive technical guide to understanding and implementing{" "}
              {doc.title.toLowerCase()}.
            </p>
          )}
        </header>

        <div className='doc-content-wrapper'>
          <MarkdownRenderer content={doc.content} />
        </div>

        <div className='mt-24 pt-12 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-6'>
          {prevDoc ? (
            <Link
              href={`/docs/${prevDoc.slug.join("/")}`}
              className='group flex flex-col items-start p-6 rounded-2xl border border-border/50 bg-secondary/20 hover:border-primary/30 hover:bg-primary/[0.02] transition-all hover:shadow-lg hover:shadow-primary/5'
            >
              <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-3 group-hover:text-primary/70 transition-colors'>
                Previous
              </span>
              <span className='font-bold text-lg text-foreground/80 flex items-center gap-2 group-hover:text-foreground group-hover:-translate-x-1 transition-transform duration-300'>
                <ChevronLeft
                  size={18}
                  className='text-primary/40 group-hover:text-primary transition-colors'
                />{" "}
                {prevDoc.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {nextDoc ? (
            <Link
              href={`/docs/${nextDoc.slug.join("/")}`}
              className='group flex flex-col items-end p-6 rounded-2xl border border-border/50 bg-secondary/20 hover:border-primary/30 hover:bg-primary/[0.02] transition-all hover:shadow-lg hover:shadow-primary/5 text-right'
            >
              <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-3 group-hover:text-primary/70 transition-colors'>
                Next
              </span>
              <span className='font-bold text-lg text-foreground/80 flex items-center gap-2 group-hover:text-foreground group-hover:translate-x-1 transition-transform duration-300'>
                {nextDoc.title}{" "}
                <ChevronRight
                  size={18}
                  className='text-primary/40 group-hover:text-primary transition-colors'
                />
              </span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>

      <div className='hidden xl:block w-64 shrink-0'>
        <div className='sticky top-10'>
          <TableOfContents toc={toc} />
        </div>
      </div>
    </div>
  );
}
