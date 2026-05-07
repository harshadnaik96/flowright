import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import GithubSlugger from 'github-slugger';
import { DOCS_NAV, type NavItem, type NavSection } from './docs-manifest';

const contentDir = path.join(process.cwd(), 'src/content/docs');

export type { NavItem, NavSection };

export type DocItem = {
  slug: string[]
  title: string
  isDir: boolean
  children?: DocItem[]
}

export function getDocBySlug(slug: string[]) {
  const filePath = path.join(contentDir, ...slug) + '.mdx';

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    const title =
      data.title ||
      slug[slug.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

    return { slug, frontmatter: data, content, title };
  } catch {
    return null;
  }
}

export function getAllDocs(): DocItem[] {
  return DOCS_NAV.map((section) => ({
    slug: [section.title.toLowerCase().replace(/ /g, '-')],
    title: section.title,
    isDir: true,
    children: section.items.map((item) => ({
      slug: item.slug,
      title: item.title,
      isDir: false,
    })),
  }));
}

export function getFlatDocs(docs: DocItem[] = getAllDocs()): DocItem[] {
  let flat: DocItem[] = [];
  for (const doc of docs) {
    if (doc.isDir && doc.children) {
      flat = flat.concat(getFlatDocs(doc.children));
    } else if (!doc.isDir) {
      flat.push(doc);
    }
  }
  return flat;
}

export type TocEntry = {
  level: number
  title: string
  id: string
}

export function getTableOfContents(content: string): TocEntry[] {
  const slugger = new GithubSlugger();
  const headingsRegex = /^(#{2,3})\s+(.+)$/gm;
  const entries: TocEntry[] = [];

  let match;
  while ((match = headingsRegex.exec(content)) !== null) {
    entries.push({
      level: match[1].length,
      title: match[2],
      id: slugger.slug(match[2]),
    });
  }

  return entries;
}
