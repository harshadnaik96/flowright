import React from 'react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypePrettyCode from 'rehype-pretty-code';
import { CodeBlock } from './CodeBlock';
import Link from 'next/link';

interface MarkdownRendererProps {
  content: string;
}

const rehypeCaptureRaw = () => (tree: any) => {
  const visit = (node: any) => {
    if (node?.type === 'element' && node?.tagName === 'pre') {
      const codeEl = node.children[0];
      if (codeEl?.tagName === 'code' && codeEl.children?.[0]?.type === 'text') {
        node.properties['data-raw-string'] = codeEl.children[0].value;
      }
    }
    if (node.children) {
      node.children.forEach(visit);
    }
  };
  visit(tree);
};

// Helper to filter out event handlers and non-serializable props from MDX elements
const filterProps = (props: any) => {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) => !key.startsWith('on') && typeof value !== 'function'
    )
  );
};

export async function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-zinc dark:prose-invert max-w-none w-full
      prose-headings:font-sans prose-headings:tracking-tight prose-headings:text-foreground/90
      prose-h1:text-xl prose-h1:font-bold prose-h1:mb-6 prose-h1:tracking-tight
      prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-3 prose-h2:pb-1 prose-h2:border-b prose-h2:border-border/40
      prose-h3:text-base prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-2
      prose-p:text-[14px] prose-p:leading-[1.6] prose-p:text-foreground/75 prose-p:mb-4
      prose-a:text-primary prose-a:font-semibold prose-a:no-underline hover:prose-a:underline
      prose-pre:p-0 prose-pre:bg-transparent prose-pre:my-6
      prose-strong:text-foreground/100 prose-strong:font-bold
      prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
      prose-ul:my-4 prose-ol:my-4
      prose-li:text-foreground/75 prose-li:my-1.5 prose-li:leading-relaxed">
      <MDXRemote 
        source={content}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [
              rehypeCaptureRaw,
              rehypeSlug,
              [rehypePrettyCode, { 
                theme: 'one-dark-pro',
                onVisitLine(node: any) {
                  // Prevent lines from collapsing in `display: grid` mode, and allow empty lines to be copy/pasted
                  if (node.children.length === 0) {
                    node.children = [{ type: 'text', value: ' ' }];
                  }
                },
              }]
            ],
          }
        }}
        components={{
          pre: ({ children, 'data-raw-string': raw, ...props }: any) => {
            return <CodeBlock raw={raw} {...filterProps(props)}>{children}</CodeBlock>;
          },
          a: ({ href, children, ...props }: any) => {
            const isExternal = href?.startsWith('http');
            const filteredProps = filterProps(props);
            if (isExternal) {
              return <a href={href} target="_blank" rel="noopener noreferrer" {...filteredProps}>{children}</a>;
            }
            return <Link href={href || '#'} {...filteredProps}>{children}</Link>;
          },
          // More exhaustive filtering of HTML elements to prevent event handler leakage
          div: ({ children, ...props }: any) => <div {...filterProps(props)}>{children}</div>,
          span: ({ children, ...props }: any) => <span {...filterProps(props)}>{children}</span>,
          p: ({ children, ...props }: any) => <p {...filterProps(props)}>{children}</p>,
          code: ({ children, ...props }: any) => <code {...filterProps(props)}>{children}</code>,
          h1: ({ children, ...props }: any) => <h1 {...filterProps(props)}>{children}</h1>,
          h2: ({ children, ...props }: any) => <h2 {...filterProps(props)}>{children}</h2>,
          h3: ({ children, ...props }: any) => <h3 {...filterProps(props)}>{children}</h3>,
          h4: ({ children, ...props }: any) => <h4 {...filterProps(props)}>{children}</h4>,
          h5: ({ children, ...props }: any) => <h5 {...filterProps(props)}>{children}</h5>,
          h6: ({ children, ...props }: any) => <h6 {...filterProps(props)}>{children}</h6>,
          ul: ({ children, ...props }: any) => <ul {...filterProps(props)}>{children}</ul>,
          ol: ({ children, ...props }: any) => <ol {...filterProps(props)}>{children}</ol>,
          li: ({ children, ...props }: any) => <li {...filterProps(props)}>{children}</li>,
          blockquote: ({ children, ...props }: any) => <blockquote {...filterProps(props)}>{children}</blockquote>,
          hr: ({ ...props }: any) => <hr {...filterProps(props)} />,
          table: ({ children, ...props }: any) => <table {...filterProps(props)}>{children}</table>,
          thead: ({ children, ...props }: any) => <thead {...filterProps(props)}>{children}</thead>,
          tbody: ({ children, ...props }: any) => <tbody {...filterProps(props)}>{children}</tbody>,
          tr: ({ children, ...props }: any) => <tr {...filterProps(props)}>{children}</tr>,
          td: ({ children, ...props }: any) => <td {...filterProps(props)}>{children}</td>,
          th: ({ children, ...props }: any) => <th {...filterProps(props)}>{children}</th>,
          figure: ({ children, ...props }: any) => <figure {...filterProps(props)}>{children}</figure>,
          figcaption: ({ children, ...props }: any) => <figcaption {...filterProps(props)}>{children}</figcaption>,
        }}
      />
    </div>
  );
}
