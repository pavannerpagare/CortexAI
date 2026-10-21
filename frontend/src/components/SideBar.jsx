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
} from "lucide-react";
import { useEffect, useState } from "react";
import { getConversations } from "../features/getConversations";
import { useDispatch, useSelector } from "react-redux";
import {
  addConversation,
  setConversations,
  setSelectedConversation,
} from "../redux/conversationSlice";
import { createConversation } from "../features/createConversation";
import logOut from "../features/logOut";
import { setUserData } from "../redux/userSlice";
import DocumentLibrary from "./documentLibrary";
function SideBar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showDocumentLibrary, setShowDocumentLibrary] = useState(false);
  const dispatch = useDispatch();
  const [imageError, setImageError] = useState(false);
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
            onClick={() => dispatch(setSelectedConversation(null))}
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
            const isActive = selectedConversation?._id == conv?._id;

            return (
              <div
                key={conv._id || i}
                onClick={() => dispatch(setSelectedConversation(conv))}
                className={`flex items-center gap-2.5 cursor-pointer mb-0.5 px-3 py-2.5 rounded-[10px] border transition-colors duration-150 ${
                  isActive
                    ? "bg-indigo-500/10 border-indigo-500/[0.18]"
                    : "bg-transparent border-transparent"
                }`}
              >
                <div
                  className={`flex items-center justify-center shrink-0 w-[28px] h-[28px] rounded-lg
                    transition-colors duration-150
            ${isActive ? "bg-indigo-500/15 text-indigo-400" : "bg-white/[0.05] text-slate-500 "}`}
                >
                  <MessageSquare size={13} />
                </div>

                <span
                  className={`text-[13px] font-medium truncate 
                ${isActive ? "text-slate-100" : "text-slate-300"}`}
                >
                  {conv?.title || "New Chat"}
                </span>
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
