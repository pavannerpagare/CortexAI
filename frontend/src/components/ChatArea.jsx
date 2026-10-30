import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import Nav from "./Nav";
import { setMessages } from "../redux/messageSlice";
import getMessages from "../features/getMessages";

function ChatArea() {
  const { selectedConversation } = useSelector((state) => state.conversation);
  const dispatch = useDispatch();

  const conversationId = selectedConversation?._id;

  useEffect(() => {
    let active = true;

    const loadMessages = async () => {
      if (!conversationId) {
        dispatch(setMessages([]));
        return;
      }

      try {
        const data = await getMessages(conversationId);

        if (active) {
          dispatch(setMessages(data));
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };

    loadMessages();

    return () => {
      active = false;
    };
  }, [conversationId, dispatch]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0d0f14]">
      <Nav />
      <MessageList />
      <ChatInput />
    </div>
  );
}

export default ChatArea;
