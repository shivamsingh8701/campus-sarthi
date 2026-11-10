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
      <TopBar title="Documents" />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={getDocuments} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No documents yet"
            description="Analyze an assignment to generate a document."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Filename</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Assignment</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Size</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Generated</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {documents.map((doc, idx) => (
                    <tr key={doc._id || doc.id || idx} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-900 font-medium truncate max-w-[200px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 truncate max-w-[180px]">
                        {doc.assignment?.title || '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatBytes(doc.fileSize ?? doc.fileSizeBytes)}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {safeFormatDate(doc.generatedAt || doc.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <a href={getDownloadUrl(doc._id || doc.id || '')} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            Download
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

export default DocumentsPage