import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import GithubSlugger from 'github-slugger';

const docsDirectory = path.join(process.cwd(), '../../docs');

export interface DocItem {
  slug: string[];
  title: string;
  isDir: boolean;
  children?: DocItem[];
  order?: number;
}

export function getDocBySlug(slug: string[]) {
  const realSlug = slug.join('/');
  const fullPath = path.join(docsDirectory, `${realSlug}.md`);
  
  try {
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);
    
    // Fallback title to the filename if no frontmatter title exists
    const title = data.title || slug[slug.length - 1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return { slug, frontmatter: data, content, title };
  } catch (error) {
    return null;
  }
}

export function getAllDocs(): DocItem[] {
  function readDirectory(dir: string, baseSlug: string[] = []): DocItem[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    const items = entries.map((entry): DocItem | null => {
      if (entry.name.startsWith('.')) return null;

      const fullPath = path.join(dir, entry.name);
      const currentSlug = [...baseSlug, entry.name.replace(/\.md$/, '')];

      if (entry.isDirectory()) {
        return {
          slug: currentSlug,
          title: entry.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          isDir: true,
          children: readDirectory(fullPath, currentSlug),
        };
      }

      if (entry.name.endsWith('.md')) {
        const fileContents = fs.readFileSync(fullPath, 'utf8');
        const { data } = matter(fileContents);
        const title = data.title || entry.name.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        return {
          slug: currentSlug,
          title,
          isDir: false,
          order: data.order || 999,
        };
      }

      return null;
    });

    return items
      .filter((item): item is DocItem => item !== null)
      .sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return a.title.localeCompare(b.title);
      });
  }

  try {
     return readDirectory(docsDirectory);
  } catch(e) {
     return [];
  }
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

export interface TocEntry {
  level: number;
  title: string;
  id: string;
}

export function getTableOfContents(content: string): TocEntry[] {
  const slugger = new GithubSlugger();
  const headingsRegex = /^(#{2,3})\s+(.+)$/gm;
  const entries: TocEntry[] = [];
  
  let match;
  while ((match = headingsRegex.exec(content)) !== null) {
    const level = match[1].length;
    const title = match[2];
    const id = slugger.slug(title);
    entries.push({ level, title, id });
  }
  
  return entries;
}
