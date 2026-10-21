import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
function MessageBubble({ role, content, sources = [] }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed
    ${
      isUser
        ? "bg-linear-to-br from-indigo-500 to-violet-700 text-white rounded-tr-sm"
        : "bg-white/[0.04] border border-white/[0.07] text-slate-200 rounded-tl-sm"
    }`}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>

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
