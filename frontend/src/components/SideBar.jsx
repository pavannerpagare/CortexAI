import {
  Coins,
  FolderOpen,
  LogOut,
  MessageSquare,
  PanelLeftIcon,
  PanelRight,
  PenSquare,
  Plus,
  User,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getConversations } from "../features/getConversations";
import { useDispatch, useSelector } from "react-redux";
import {
  addConversation,
  setConversations,
  setSelectedConversation,
  removeConversation,
  setConvTitle,
} from "../redux/conversationSlice";
import { createConversation } from "../features/createConversation";
import logOut from "../features/logOut";
import { setUserData } from "../redux/userSlice";
import DocumentLibrary from "./documentLibrary";
import { deleteConversation } from "../features/deleteConversation";
import { updateConversation } from "../features/updateConversation";
import { removeConversationMessages } from "../redux/messageSlice";

function SideBar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showDocumentLibrary, setShowDocumentLibrary] = useState(false);
  const dispatch = useDispatch();
  const [imageError, setImageError] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [renamingConversationId, setRenamingConversationId] = useState(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [savingConversationId, setSavingConversationId] = useState(null);
  const { conversations, selectedConversation } = useSelector(
    (state) => state.conversation,
  );
  const { userData } = useSelector((state) => state.user);

  useEffect(() => {
    const getConv = async () => {
      try {
        const data = await getConversations();
        dispatch(setConversations(data));
      } catch (error) {
        console.error("Failed to fetch conversations:", error);
      }
    };

    getConv();
  }, [userData?.userId, dispatch]);

  const handleDeleteConversation = async (
    event,
    conversationId,
    conversationTitle,
  ) => {
    event.stopPropagation();

    const confirmed = window.confirm(
      `Delete "${conversationTitle || "New Chat"}"? This will permanently delete this conversation and its messages.`,
    );

    if (!confirmed) return;

    try {
      setDeletingConversationId(conversationId);

      await deleteConversation(conversationId);

      dispatch(removeConversation(conversationId));
      dispatch(removeConversationMessages(conversationId));
      
    } catch (error) {
      console.error("Failed to delete conversation:", error);

      window.alert(
        error?.response?.data?.message ||
          "Failed to delete conversation. Please try again.",
      );
    } finally {
      setDeletingConversationId(null);
    }
  };

  const handleStartRename = (event, conversation) => {
    event.stopPropagation();

    setRenamingConversationId(conversation._id);
    setRenamingTitle(conversation.title || "");
  };

  const handleCancelRename = (event) => {
    event.stopPropagation();

    setRenamingConversationId(null);
    setRenamingTitle("");
  };

  const handleSaveRename = async (event, conversationId) => {
    event.preventDefault();
    event.stopPropagation();

    const cleanTitle = renamingTitle.trim();

    if (!cleanTitle) {
      window.alert("Conversation title cannot be empty.");
      return;
    }

    if (cleanTitle.length > 100) {
      window.alert("Title must be 100 characters or fewer.");
      return;
    }

    try {
      setSavingConversationId(conversationId);

      const updatedConversation = await updateConversation({
        id: conversationId,
        title: cleanTitle,
      });

      dispatch(
        setConvTitle({
          conversationId,
          title: updatedConversation?.title || cleanTitle,
        }),
      );

      setRenamingConversationId(null);
      setRenamingTitle("");
    } catch (error) {
      console.error("Rename conversation failed:", error);

      window.alert(
        error?.response?.data?.message ||
          "Unable to rename conversation. Please try again.",
      );
    } finally {
      setSavingConversationId(null);
    }
  };

  const handleCreateConversation = async () => {
    try {
      const data = await createConversation();

      dispatch(addConversation(data));
      dispatch(setSelectedConversation(data)); // Select the new chat
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  if (collapsed) {
    return (
      <div
        className="hidden lg:flex flex-col items-center w-[56px] h-screen bg-[#0d0f14] border-r
    border-white/[0.06] py-4 gap-1 shrink-0 "
      >
        <button
          className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 
        hover:text-slate-200 hover:bg-white/[0.05] transition-colors duration-150 bg-transparent 
        border-none cursor-pointer mb-1"
          onClick={() => setCollapsed(false)}
        >
          <PanelRight />
        </button>

        <button
          className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 
        hover:text-slate-200 hover:bg-white/[0.05] transition-colors duration-150 bg-transparent 
        border-none cursor-pointer"
          onClick={() => dispatch(setSelectedConversation(null))}
        >
          <Plus size={17} />
        </button>

        <div className="relative shrink-0">
          {userData?.avatar && !imageError ? (
            <img
              className="w-9 h-9 rounded-[10px] object-cover border-2
                    border-indigo-500/25 "
              src={userData?.avatar}
              alt={"image"}
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="w-9 h-9 rounded-[10px] bg-white/[0.06] flex
                items-center justify-center "
            >
              <User size={15} className="text-slate-400" />
            </div>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto px-2.5 pb-2 pt-5
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden "
        >
          {conversations.map((conv, i) => {
            const isActive = selectedConversation?._id == conv?._id;
            return (
              <div
                key={conv._id || i}
                onClick={() => dispatch(setSelectedConversation(conv))}
                className={`flex items-center gap-2.5 cursor-pointer mb-0.5 px-3 py-2.5 rounded-[10px] border transition-colors duration-150 
            ${
              isActive
                ? "bg-indigo-500/10 border-indigo-500/[0.18]"
                : "bg-transparent border-transparent"
            }`}
              >
                <div
                  className={`flex items-center justify-center shrink-0 w-[20px] h-[20px] rounded-lg
                    transition-colors duration-150
            ${isActive ? "bg-indigo-500/15 text-indigo-400" : "bg-white/[0.05] text-slate-500 "}`}
                >
                  <MessageSquare size={13} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[270px] h-screen shrink-0
            bg-[#0d0f14] border-r border-white/[0.06]"
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
          <div
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-500
                        hover:text-slate-200 hover:bg-white/[0.05] transition-colors duration-150
                        bg-transparent border-none cursor-pointer"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftIcon />
          </div>

          <span className="text-[16px] font-semibold text-slate-100 tracking-tight flex-1">
            CortexAI
          </span>

          <span
            className="text-[10px] font-medium text-indigo-400
                        bg-indigo-500/10 border border-indigo-500/20
                        px-2 py-0.5 rounded-full tracking-wide"
          >
            free
          </span>

          <button
            className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500
                        hover:text-slate-200 hover:bg-white/5 transition-colors duration-150
                        bg-transparent border-none cursor-pointer"
            onClick={() => dispatch(setSelectedConversation(null))}
          >
            <PenSquare size={14} />
          </button>
        </div>

        <div className="px-4 pt-4 pb-1">
          <button
            className="w-full flex items-center justify-center gap-2
                        text-sm font-medium text-white
                        bg-linear-to-br from-indigo-500 to-violet-700
                        rounded-xl py-[10px]
                        border-none cursor-pointer
                        hover:opacity-90 transition-opacity duration-150"
            onClick={handleCreateConversation}
          >
            <Plus size={15} />
            New Chat
          </button>
        </div>

        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => setShowDocumentLibrary(true)}
            className="w-full flex items-center gap-3 rounded-xl
      border border-white/[0.06] bg-white/[0.02]
      px-3 py-2.5 text-sm text-slate-300
      hover:bg-white/[0.06] hover:text-white"
          >
            <FolderOpen size={17} className="text-indigo-400" />
            <span>Document Library</span>
          </button>
        </div>

        {conversations.length == 0 ? (
          <div
            className="px-5 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest
                text-slate-600 "
          >
            No Recent Conversations
          </div>
        ) : (
          <div
            className="px-5 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest
                text-slate-600 "
          >
            Recents
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto px-2.5 pb-2 [scrollbar-width:none] [&
            ::-webkit-scrollbar]:hidden"
        >
          {conversations.map((conv, i) => {
            const isActive = selectedConversation?._id === conv?._id;
            const isDeleting = deletingConversationId === conv._id;

            return (
              <div
                key={conv._id || i}
                onClick={() => dispatch(setSelectedConversation(conv))}
                className={`flex items-center gap-2.5 cursor-pointer mb-0.5 px-3 py-2.5 rounded-[10px] border transition-colors duration-150 ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/[0.18]"
                    : "bg-transparent border-transparent hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`flex items-center justify-center shrink-0 w-[28px] h-[28px] rounded-lg
        transition-colors duration-150
        ${
          isActive
            ? "bg-indigo-500/15 text-indigo-400"
            : "bg-white/[0.05] text-slate-500"
        }`}
                >
                  <MessageSquare size={13} />
                </div>

                {renamingConversationId === conv._id ? (
                  <div
                    className="flex items-center flex-1 min-w-0 gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={renamingTitle}
                      maxLength={100}
                      autoFocus
                      disabled={savingConversationId === conv._id}
                      onChange={(event) => setRenamingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleSaveRename(event, conv._id);
                        }
                        if (event.key === "Escape") {
                          handleCancelRename(event);
                        }
                      }}
                      className="flex-1 min-w-0 w-full bg-white/[0.06]
      border border-indigo-500/40 rounded-md px-2 py-1
      text-xs text-white outline-none"
                    />

                    <button
                      type="button"
                      title="Save title"
                      disabled={
                        !renamingTitle.trim() ||
                        savingConversationId === conv._id
                      }
                      onClick={(event) => handleSaveRename(event, conv._id)}
                      className="flex items-center justify-center w-6 h-6
      rounded-md border-none bg-transparent text-green-400
      hover:bg-green-500/10 disabled:opacity-40"
                    >
                      <Check size={14} />
                    </button>

                    <button
                      type="button"
                      title="Cancel rename"
                      disabled={savingConversationId === conv._id}
                      onClick={handleCancelRename}
                      className="flex items-center justify-center w-6 h-6
      rounded-md border-none bg-transparent text-slate-400
      hover:bg-white/[0.08]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className={`text-[13px] font-medium truncate flex-1 min-w-0
      ${isActive ? "text-slate-100" : "text-slate-300"}`}
                    >
                      {conv?.title || "New Chat"}
                    </span>

                    <button
                      type="button"
                      title="Rename conversation"
                      onClick={(event) => handleStartRename(event, conv)}
                      className="flex items-center justify-center shrink-0 w-7 h-7
      rounded-lg border-none bg-transparent text-slate-600
      hover:bg-indigo-500/10 hover:text-indigo-400"
                    >
                      <Pencil size={13} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  title="Delete conversation"
                  aria-label={`Delete ${conv?.title || "New Chat"}`}
                  disabled={isDeleting}
                  onClick={(event) =>
                    handleDeleteConversation(event, conv._id, conv?.title)
                  }
                  className="flex items-center justify-center shrink-0 w-7 h-7 rounded-lg
        border-none bg-transparent text-slate-600
        hover:bg-red-500/10 hover:text-red-400
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors duration-150"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mx-2.5 h-px bg white/[0.06] " />
        <div className="px-3.5 py-3.5">
          {userData ? (
            <div
              className="flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 
                hover:bg-white/[0.05] transition-colors duration-150"
            >
              <div className="relative shrink-0">
                {userData?.avatar && !imageError ? (
                  <img
                    className="w-9 h-9 rounded-[10px] object-cover border-2
                    border-indigo-500/25 "
                    src={userData?.avatar}
                    alt={"image"}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-[10px] bg-white/[0.06] flex
                items-center justify-center "
                  >
                    <User size={15} className="text-slate-400" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-slate-100 truncate ">
                  {userData?.name || "user"}
                </p>

                <p className="text-[11px] text-slate-600 mt-px ">
                  {"Free Plan"}
                </p>
              </div>

              <div className="flex gap-1">
                <button className="flex items-center justify-center w-7 h-7 rounded-[7px] border-none bg-transparent text-yellow-600 cursor-pointer hover:bg-white/[0.08] hover:text-slate-400 transition-all duration-150">
                  <Coins size={16} />
                </button>
                <button
                  className="flex items-center justify-center w-7 h-7 rounded-[7px] 
                border-none bg-transparent text-slate-600 cursor-pointer 
                hover:bg-white/[0.08] hover:text-slate-400 transition-all duration-150"
                  onClick={() => {
                    logOut();
                    dispatch(setUserData(null));
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full flex items-center justify-center 
            gap-2 text-sm font-medium text-slate-200 
            bg-white/[0.05] border border-white/[0.08] rounded-xl py-[11px] cursor-pointer hover:bg-white/[0.08] transition-colors duration-150"
            >
              Login
            </button>
          )}
        </div>
      </div>
      {/* Document Library Modal */}
      <DocumentLibrary
        isOpen={showDocumentLibrary}
        onClose={() => setShowDocumentLibrary(false)}
      />
    </div>
  );
}

export default SideBar;
