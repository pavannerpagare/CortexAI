import {
  Code2,
  FileText,
  Globe,
  ImageIcon,
  MessageSquare,
  Mic,
  Paperclip,
  Presentation,
  Send,
  Zap,
} from "lucide-react";

import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import sendMessage from "../features/sendMessage";
import uploadDocument from "../features/uploadDocument";
import { addMessage } from "../redux/messageSlice";
import { createConversation } from "../features/createConversation";

import {
  addConversation,
  setConvTitle,
  setSelectedConversation,
} from "../redux/conversationSlice";

import { updateConversation } from "../features/updateConversation";

function ChatInput() {
  const [value, setValue] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("Auto");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const fileInputRef = useRef(null);

  const { selectedConversation } = useSelector(
    (state) => state.conversation
  );

  const dispatch = useDispatch();

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || isUploading) return;

    setIsUploading(true);
    setUploadStatus(`Indexing ${file.name}...`);

    try {
      const result = await uploadDocument(file);
      const doc = result?.document;

      if (!doc) {
        throw new Error(
          result?.message ||
            "Upload response did not contain document information."
        );
      }

      setUploadStatus(
        `${doc.filename} indexed (${doc.chunkCount} chunks). You can now ask about your documents.` +
          (doc.truncated
            ? " Note: very long text was truncated."
            : "")
      );
    } catch (error) {
      console.error("Document upload failed:", error);

      setUploadStatus(
        error?.message || "Document upload failed. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };


  const handleSendMessage = async () => {
    const prompt = value.trim();

    if (!prompt) return;

    try {
      let conversation = selectedConversation;


      if (!conversation) {
        const conv = await createConversation();

        if (!conv?._id) {
          throw new Error("Could not create a conversation.");
        }

        dispatch(setSelectedConversation(conv));
        dispatch(addConversation(conv));

        conversation = conv;
      }

      const title = prompt.slice(0, 40);

      const currentTitle = String(
        conversation?.title ?? ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

      const shouldUpdateTitle =
        !currentTitle || currentTitle === "new chat";

      if (shouldUpdateTitle) {
        await updateConversation({
          id: conversation._id,
          title,
        });

        dispatch(
          setConvTitle({
            conversationId: conversation._id,
            title,
          })
        );
      }

      const payload = {
        prompt,
        conversationId: conversation._id,
        agent: selectedAgent.toLowerCase(),
      };

      dispatch(
        addMessage({
          role: "user",
          content: prompt,
        })
      );

      setValue("");

      const data = await sendMessage(payload);

      if (!data) {
        throw new Error(
          "Message failed. Check the Agent Service terminal."
        );
      }


      dispatch(
        addMessage({
          role: "assistant",
          content: data.answer,
          images: data.images ?? [],
          sources: data.sources ?? [],
        })
      );

      console.log("Assistant response received.");
    } catch (error) {
      console.error("Message failed:", error);

      setValue((current) => current || prompt);
    }
  };

  const agents = [
    { id: "auto", icon: Zap, label: "Auto" },
    { id: "chat", icon: MessageSquare, label: "Chat" },
    { id: "coding", icon: Code2, label: "Coding" },
    { id: "pdf", icon: FileText, label: "PDF" },
    { id: "ppt", icon: Presentation, label: "PPT" },
    { id: "image", icon: ImageIcon, label: "Image" },
    { id: "search", icon: Globe, label: "Search" },
  ];

  return (
    <div className="w-full overflow-hidden px-3 md:px-5 py-4 border-t border-white/[0.06] bg-[#0d0f14]">
      <div className="flex flex-col gap-2 bg-white/[0.03] border border-white/[0.07] rounded-2xl px-4 pt-3.5 pb-3">

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.docx"
          onChange={handleDocumentUpload}
        />

        {uploadStatus && (
          <p
            className="text-xs text-slate-400"
            role="status"
            aria-live="polite"
          >
            {uploadStatus}
          </p>
        )}

        <div className="flex w-[80%] gap-2 pr-2 flex-wrap">
          {agents.map((agent) => {
            const isActive = selectedAgent === agent.label;
            const Icon = agent.icon;

            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgent(agent.label)}
                aria-pressed={isActive}
                className={`flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white border-transparent shadow-[0_1px_8px_rgba(99,102,241,.35)]"
                    : "bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.07]"
                }`}
              >
                <Icon
                  size={14}
                  className={
                    isActive ? "text-white" : "text-slate-500"
                  }
                />
                <span>{agent.label}</span>
              </button>
            );
          })}
        </div>

        <textarea
          placeholder="Ask Anything..."
          onChange={(event) => setValue(event.target.value)}
          value={value}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              handleSendMessage();
            }
          }}
          className="w-full bg-transparent outline-none resize-none text-[14px] text-slate-200 placeholder:text-slate-600 leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          rows={3}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">

            <button
              type="button"
              title="Upload a document"
              aria-label="Upload a document"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-150 bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Paperclip size={16} />
            </button>

            <button
              type="button"
              title="Voice input"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-150 bg-transparent cursor-pointer"
            >
              <Mic size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!value.trim()}
            aria-label="Send message"
            className={`flex items-center justify-center w-8 h-8 rounded-lg border-none transition-all duration-150 ${
              value.trim()
                ? "bg-gradient-to-br from-indigo-500 to-violet-700 hover:opacity-90 text-white cursor-pointer"
                : "bg-white/[0.05] text-slate-600 cursor-not-allowed"
            }`}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;