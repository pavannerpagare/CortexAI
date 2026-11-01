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
import { addMessageToConversation } from "../redux/messageSlice";
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
  const [isSending, setIsSending] = useState(false);

  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageStatus, setImageStatus] = useState("");

  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const sendingRef = useRef(false);

  const { selectedConversation } = useSelector((state) => state.conversation);

  const dispatch = useDispatch();

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || isUploading || sendingRef.current) return;

    setIsUploading(true);
    setUploadStatus(`Indexing ${file.name}...`);

    try {
      const result = await uploadDocument(file);
      const doc = result?.document;

      if (!doc) {
        throw new Error(
          result?.message ||
            "Upload response did not contain document information.",
        );
      }

      setUploadStatus(
        `${doc.filename} indexed (${doc.chunkCount} chunks). You can now ask about your documents.` +
          (doc.truncated ? " Note: very long text was truncated." : ""),
      );
    } catch (error) {
      console.error("Document upload failed:", error);

      setUploadStatus(
        error?.message || "Document upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setImageStatus("Please choose a PNG, JPEG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageStatus("Image must be smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setImageStatus("Could not read the selected image.");
        return;
      }

      setSelectedImage({
        name: file.name,
        dataUrl: reader.result,
      });

      setImageStatus(`Selected: ${file.name}`);
    };

    reader.onerror = () => {
      setImageStatus("Could not read the selected image.");
    };

    reader.readAsDataURL(file);
  };

  const handleSendMessage = async () => {
    const prompt = value.trim();

    // Stop empty and duplicate submissions.
    if (!prompt || sendingRef.current || isUploading) {
      return;
    }

    // Lock synchronously before starting asynchronous work.
    sendingRef.current = true;
    setIsSending(true);

    try {
      let conversation = selectedConversation;

      // Create a conversation when none is selected.
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

      const currentTitle = String(conversation?.title ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

      const shouldUpdateTitle = !currentTitle || currentTitle === "new chat";

      if (shouldUpdateTitle) {
        await updateConversation({
          id: conversation._id,
          title,
        });

        dispatch(
          setConvTitle({
            conversationId: conversation._id,
            title,
          }),
        );
      }

      // Capture the selected agent and image for this request.
      const currentAgent = selectedAgent.toLowerCase();

      const payload = {
        prompt,
        conversationId: conversation._id,
        agent: currentAgent,
        ...(currentAgent === "image" && selectedImage
          ? { imageData: selectedImage.dataUrl }
          : {}),
      };

      dispatch(
        addMessageToConversation({
          conversationId: conversation._id,
          message: {
            role: "user",
            content: prompt,
          },
        }),
      );

      setValue("");

      const data = await sendMessage(payload);

      if (!data || typeof data.answer !== "string" || !data.answer.trim()) {
        throw new Error(
          "The server returned an empty or invalid response. Check the Agent Service terminal.",
        );
      }

      dispatch(
        addMessageToConversation({
          conversationId: conversation._id,
          message: {
            role: "assistant",
            content: data.answer,
            images: data.images ?? [],
            sources: data.sources ?? [],
            artifacts: data.artifacts ?? [],
          },
        }),
      );

      console.log("[ChatInput] Assistant response received.");
    } catch (error) {
      console.error("[ChatInput] Message failed:", error);

      // Restore the prompt so the user can retry.
      setValue((current) => current || prompt);
    } finally {
      // Always release the lock after success or failure.
      sendingRef.current = false;
      setIsSending(false);
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

  const canSend = Boolean(value.trim()) && !isSending && !isUploading;

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

        <input
          ref={imageInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleImageSelect}
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

        {imageStatus && (
          <p
            className="text-xs text-slate-400"
            role="status"
            aria-live="polite"
          >
            {imageStatus}
          </p>
        )}

        {selectedImage && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 p-2">
            <img
              src={selectedImage.dataUrl}
              alt="Selected image preview"
              className="h-16 w-16 rounded-md object-cover"
            />

            <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
              {selectedImage.name}
            </span>

            <button
              type="button"
              disabled={isSending}
              onClick={() => {
                setSelectedImage(null);
                setImageStatus("");
              }}
              className="text-xs text-slate-400 hover:text-white disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex w-[80%] gap-2 pr-2 flex-wrap">
          {agents.map((agent) => {
            const isActive = selectedAgent === agent.label;
            const Icon = agent.icon;

            return (
              <button
                key={agent.id}
                type="button"
                disabled={isSending}
                onClick={() => setSelectedAgent(agent.label)}
                aria-pressed={isActive}
                className={`flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white border-transparent shadow-[0_1px_8px_rgba(99,102,241,.35)]"
                    : "bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.07]"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Icon
                  size={14}
                  className={isActive ? "text-white" : "text-slate-500"}
                />
                <span>{agent.label}</span>
              </button>
            );
          })}
        </div>

        <textarea
          placeholder={isSending ? "Generating response..." : "Ask Anything..."}
          onChange={(event) => setValue(event.target.value)}
          value={value}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void handleSendMessage();
            }
          }}
          className="w-full bg-transparent outline-none resize-none text-[14px] text-slate-200 placeholder:text-slate-600 leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          rows={3}
          aria-label="Message input"
        />

        {isSending && (
          <p
            className="text-xs text-indigo-300"
            role="status"
            aria-live="polite"
          >
            Processing your request. Please wait...
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              title={
                selectedAgent === "Image"
                  ? "Upload an image"
                  : "Upload a document"
              }
              aria-label={
                selectedAgent === "Image"
                  ? "Upload an image"
                  : "Upload a document"
              }
              disabled={isUploading || isSending}
              onClick={() => {
                if (selectedAgent === "Image") {
                  imageInputRef.current?.click();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-150 bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Paperclip size={16} />
            </button>

            <button
              type="button"
              title="Voice input"
              disabled={isSending}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-150 bg-transparent cursor-pointer disabled:opacity-50"
            >
              <Mic size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSendMessage()}
            disabled={!canSend}
            aria-label={isSending ? "Generating response" : "Send message"}
            aria-busy={isSending}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border-none transition-all duration-150 ${
              canSend
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
