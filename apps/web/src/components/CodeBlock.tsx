import React from 'react';
import { CopyButton } from './CopyButton';

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  raw?: string;
}

export function CodeBlock({ children, raw, ...props }: CodeBlockProps) {
  return (
    <div className="relative group rounded-lg overflow-hidden my-6 bg-slate-950 dark:bg-zinc-950">
      {raw && <CopyButton content={raw} />}
      <pre {...props} className={`p-4 overflow-x-auto text-sm ${props.className || ''}`}>
        {children}
      </pre>
    </div>
  );
}
