import { getAllDocs } from '@/lib/docs';
import { DocsSidebar } from '@/components/DocsSidebar';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const docs = getAllDocs();

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <DocsSidebar docs={docs} />
      <main className="flex-1 w-full min-w-0">
        {children}
      </main>
    </div>
  );
}
