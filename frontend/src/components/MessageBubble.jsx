import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="mt-0 mb-3 text-lg font-bold text-slate-50" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mt-0 mb-2 text-base font-semibold text-slate-100" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-0 mb-2 text-sm font-semibold text-slate-100" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h4 className="mt-0 mb-2 text-sm font-semibold text-slate-100" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mb-3 last:mb-0 whitespace-pre-wrap break-words leading-7 text-[13.5px] text-slate-200" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-[13.5px] text-slate-200" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13.5px] text-slate-200" {...props} />
  ),
  li: ({ node, ...props }) => (
    <li className="break-words leading-6" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-indigo-300 underline decoration-indigo-400 underline-offset-2 hover:text-indigo-200"
    />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-slate-50" {...props} />
  ),
  em: ({ node, ...props }) => (
    <em className="italic text-slate-100" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mb-3 border-l-2 border-indigo-400/80 bg-slate-900/60 px-3 py-2 text-slate-200"
      {...props}
    />
  ),
  pre: ({ node, ...props }) => (
    <pre
      className="mb-3 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 text-[12.5px] leading-6 text-slate-100"
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code
          className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[0.83em] text-cyan-200"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code className={`${className || ""} whitespace-pre-wrap break-words`} {...props}>
        {children}
      </code>
    );
  },
  hr: ({ node, ...props }) => (
    <hr className="my-4 border-slate-700/80" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-slate-700/80 text-left text-[12.5px]" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead className="bg-slate-800/80 text-slate-100" {...props} />
  ),
  tbody: ({ node, ...props }) => <tbody {...props} />,
  tr: ({ node, ...props }) => <tr className="border-b border-slate-700/60" {...props} />,
  th: ({ node, ...props }) => (
    <th className="border border-slate-700/80 bg-slate-800/70 px-2.5 py-2 font-semibold text-slate-50" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border border-slate-700/80 px-2.5 py-2 align-top text-slate-200" {...props} />
  ),
};

function MessageBubble({ role, content, sources = [] }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`w-full max-w-[92%] sm:max-w-[80%] md:max-w-[72%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed break-words
          ${
            isUser
              ? "rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-700 text-white"
              : "rounded-tl-sm border border-white/[0.07] bg-white/[0.04] text-slate-200"
          }`}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          skipHtml={true}
          components={markdownComponents}
          className="prose prose-invert max-w-none"
        >
          {content || ""}
        </Markdown>

        {role === "assistant" && sources.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Sources
            </p>

            <ul className="space-y-1 text-[12px] text-slate-300">
              {sources.map((source, index) => (
                <li
                  key={`${source.documentId ?? "doc"}-${source.chunkIndex ?? index}-${index}`}
                  className="break-words"
                >
                  {source.filename || "Document"} — chunk {source.chunkIndex ?? index + 1}
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
