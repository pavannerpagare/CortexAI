import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import api from "../../utils/axios";

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date) {
  if (!date) return "Unknown date";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "Unknown date";

  return parsedDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DocumentLibrary({ isOpen, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/api/agent/documents");
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (error) {
      setError(
        error.response?.data?.message || "Unable to load your documents.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, loadDocuments]);

  const handleDelete = async (document) => {
    const confirmed = window.confirm(
      `Delete "${document.filename}" and its indexed chunks?`,
    );

    if (!confirmed) return;

    setDeletingId(document.documentId);
    setError("");

    try {
      await api.delete(
        `/api/agent/documents/${encodeURIComponent(document.documentId)}`,
      );

      setDocuments((current) =>
        current.filter((item) => item.documentId !== document.documentId),
      );
    } catch (error) {
      setError(
        error.response?.data?.message || "Unable to delete this document.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-library-title"
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#13151c] shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <FolderOpen size={20} />
            </div>

            <div className="min-w-0">
              <h2
                id="document-library-title"
                className="text-base font-semibold text-white"
              >
                Document Library
              </h2>
              <p className="text-xs text-slate-400">
                Manage your RAG knowledge base
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDocuments}
              disabled={loading}
              title="Refresh documents"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close document library"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Document count */}
        <div className="border-b border-white/[0.06] px-5 py-3">
          <p className="text-xs text-slate-400">
            {documents.length} indexed{" "}
            {documents.length === 1 ? "document" : "documents"}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] p-3 text-sm text-red-300">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
              <LoaderCircle size={26} className="animate-spin" />
              <p className="text-sm">Loading your documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500">
                <FileText size={26} />
              </div>
              <h3 className="text-sm font-medium text-slate-200">
                No documents yet
              </h3>
              <p className="max-w-xs text-xs leading-5 text-slate-500">
                Upload a PDF, TXT, Markdown, or DOCX file using the paperclip
                in your chat to add it to your knowledge base.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((document) => (
                <div
                  key={document.documentId}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                      <FileText size={19} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        title={document.filename}
                        className="break-words text-sm font-medium text-slate-100"
                      >
                        {document.filename}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {formatFileSize(document.size)} ·{" "}
                        {document.mimeType || "Document"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                          Indexed
                        </span>

                        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-slate-300">
                          {document.chunkCount ?? 0} chunks
                        </span>

                        <span className="text-[11px] text-slate-500">
                          {formatDate(document.createdAt)}
                        </span>
                      </div>

                      {document.truncated && (
                        <p className="mt-2 text-xs text-amber-300">
                          Some text was excluded because the document reached
                          the processing limit.
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      title="Delete document"
                      aria-label={`Delete ${document.filename}`}
                      disabled={deletingId !== null}
                      onClick={() => handleDelete(document)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingId === document.documentId ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 py-3">
          <p className="text-[11px] text-slate-500">
            Documents are listed for your account.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/[0.06] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentLibrary;