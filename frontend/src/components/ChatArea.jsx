import { useDispatch, useSelector } from "react-redux";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import Nav from "./Nav";
import { useEffect,useRef } from "react";
import { setMessages } from "../redux/messageSlice";
import getMessages from "../features/getMessages";

function ChatArea() {
  const{selectedConversation} = useSelector(state => state.conversation)
  const dispatch = useDispatch()
  const { messages } = useSelector((state) => state.message);

const messagesRef = useRef(messages);
messagesRef.current = messages;

const conversationId = selectedConversation?._id;
  useEffect(() => {
  let active = true;

  const loadMessages = async () => {
    if (!conversationId) {
      dispatch(setMessages([]));
      return;
    }

    // Remember the current message array before fetching
    const messagesBeforeFetch = messagesRef.current;

    try {
      const data = await getMessages(conversationId);

      // Don't overwrite messages added while the request was pending
      if (
        active &&
        messagesRef.current === messagesBeforeFetch
      ) {
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
    <div className="flex-1 min-w-0 h-full flex flex-col">
        <Nav />
        <MessageList />
        <ChatInput />
      
    </div>
  );
}

export default ChatArea;