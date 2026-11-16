import { useSelector } from "react-redux";
import MessageBubble from "./MessageBubble";

function MessageList({
  isLoading = false,
  loadError = "",
  onRetry,
}) {
  const { selectedConversation } = useSelector(
    (state) => state.conversation
  );

  const messages = useSelector((state) => {
    const conversationId =
      state.conversation.selectedConversation?._id;

    return conversationId
      ? state.message.messagesByConversation[conversationId] ?? []
      : [];
  });

  const showWelcome =
    !selectedConversation ||
    (!isLoading && !loadError && messages.length === 0);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

      {loadError && messages.length > 0 && (
        <div
          className="mb-4 rounded-lg border border-yellow-500/20
          bg-yellow-500/[0.06] p-3 text-sm text-yellow-300"
          role="alert"
        >
          {loadError} Your existing messages are still available.

          <button
            type="button"
            onClick={onRetry}
            className="ml-2 underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {showWelcome ? (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[20px] font-semibold text-slate-200 tracking-tight">
              CortexAI
            </h1>

            <p className="text-[15px] font-semibold text-slate-400 tracking-tight">
              How Can I help you?
            </p>

            <p className="text-[13px] text-slate-600 max-w-[260px] leading-relaxed">
              Ask me anything - code, ideas, explanation, or just a quick
              question.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {[
              "Write a Netflix clone",
              "Explain Redis",
              "Build a dashboard",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="text-[12px] text-slate-400 bg-white/[0.04] border border-white/[0.07] px-3 py-1.5 rounded-lg hover:bg-white/[0.08] hover:text-slate-200 transition-colors duration-150 cursor-pointer"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : isLoading && messages.length === 0 ? (
        <div
          className="h-full flex flex-col items-center justify-center gap-3 text-slate-400"
          role="status"
          aria-live="polite"
        >
          <div className="w-7 h-7 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />

          <p className="text-sm">
            Loading conversation...
          </p>
        </div>
      ) : loadError && messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-400" role="alert">
            {loadError}
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm hover:bg-indigo-600"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div>
          {messages.map((msg, index) => (
            <MessageBubble
              key={
                msg._id ??
                `${msg.role}-${msg.createdAt ?? index}`
              }
              role={msg.role}
              content={msg.content}
              sources={msg.sources ?? []}
              artifacts={msg.artifacts ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageList;