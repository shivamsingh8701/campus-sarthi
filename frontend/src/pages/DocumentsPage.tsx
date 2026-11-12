import React, { useEffect } from 'react';
import { Download, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useDocuments } from '@/hooks/useDocuments';

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFormatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function DocumentsPage() {
  const { documents, isLoading, error, getDocuments, getDownloadUrl } = useDocuments();

  useEffect(() => {
    getDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Documents"
        subtitle={`${documents.length} generated PDF solution${documents.length === 1 ? '' : 's'}`}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={getDocuments} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No generated PDFs yet"
            description="Generate an AI solution draft for any assignment to create a formatted PDF study document."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.06] bg-white/40 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Document</th>
                    <th className="px-5 py-3">Assignment</th>
                    <th className="px-5 py-3">Size</th>
                    <th className="px-5 py-3">Generated</th>
                    <th className="px-5 py-3 text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/[0.05]">
                  {documents.map((doc, idx) => (
                    <tr key={doc._id || doc.id || idx} className="hover:bg-white/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-slate-900 font-medium truncate max-w-[240px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 truncate max-w-[200px]">
                        {doc.assignment?.title || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {formatBytes(doc.fileSize ?? doc.fileSizeBytes)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {safeFormatDate(doc.generatedAt || doc.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <a
                          href={getDownloadUrl(doc._id || doc.id || '')}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="outline" className="gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            <span>PDF</span>
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

export default DocumentsPage;
