import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import api from "../../utils/axios";

function MessageBubble({ role, content, sources = [], artifacts = [] }) {
  const isUser = role === "user";
  const [downloadingId, setDownloadingId] = useState("");
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async (artifact) => {
    if (!artifact?.artifactId || downloadingId) return;

    setDownloadingId(artifact.artifactId);
    setDownloadError("");

    let objectUrl;

    try {
      const { data } = await api.get(
        `/api/agent/artifacts/${encodeURIComponent(
          artifact.artifactId,
        )}/download`,
        { responseType: "blob" },
      );

      objectUrl = window.URL.createObjectURL(data);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = artifact.filename || "cortexai-report.pdf";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch (error) {
      console.error("PDF download failed:", error);
      setDownloadError("Could not download the PDF. Please try again.");
    } finally {
      setDownloadingId("");
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[72%] min-w-0 px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${
          isUser
            ? "bg-linear-to-br from-indigo-500 to-violet-700 text-white rounded-tr-sm"
            : "bg-white/[0.04] border border-white/[0.07] text-slate-200 rounded-tl-sm"
        }`}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>

        {role === "assistant" && artifacts.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-400">
              Generated files
            </p>

            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.artifactId}
                  className="flex flex-wrap items-center gap-3"
                >
                  <span className="text-xs text-slate-300">
                    {artifact.filename || "PDF report"}
                  </span>

                  <button
                    type="button"
                    disabled={!artifact.artifactId || downloadingId !== ""}
                    onClick={() => handleDownload(artifact)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloadingId === artifact.artifactId
                      ? "Downloading..."
                      : artifact.filename?.toLowerCase().endsWith(".pptx")
                        ? "Download PPT"
                        : "Download PDF"}
                  </button>
                </div>
              ))}
            </div>

            {downloadError && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {downloadError}
              </p>
            )}
          </div>
        )}

        {role === "assistant" && sources.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-400">Sources</p>

            <ul className="space-y-1">
              {sources.map((source, index) => (
                <li
                  key={`${source.documentId}-${source.chunkIndex}-${index}`}
                  className="text-xs text-slate-400"
                >
                  {source.filename} — chunk {source.chunkIndex}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
