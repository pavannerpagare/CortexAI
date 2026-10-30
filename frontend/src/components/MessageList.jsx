import { useSelector } from "react-redux";
import MessageBubble from "./MessageBubble";

function MessageList() {
  const { selectedConversation } = useSelector((state) => state.conversation);
  const { messages } = useSelector((state) => state.message);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-6 md:px-6">
      {messages.length === 0 || !selectedConversation ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-200">
              CortexAI
            </h1>
            <p className="text-[15px] font-semibold tracking-tight text-slate-400">
              How Can I help you?
            </p>
            <p className="max-w-[260px] text-[13px] leading-relaxed text-slate-600">
              Ask me anything - code, ideas, explanation, or just a quick question.
            </p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {["Write a Netflix clone", "Explain Redis", "Build a dashboard"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="cursor-pointer rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-[12px] text-slate-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-slate-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-5xl space-y-4">
          {messages.map((msg, index) => (
            <MessageBubble
              key={msg._id ?? `${msg.role}-${msg.createdAt ?? index}`}
              role={msg.role}
              content={msg.content}
              sources={msg.sources ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageList;
