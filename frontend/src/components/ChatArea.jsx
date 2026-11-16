import { useEffect, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import Nav from "./Nav";

import { setConversationMessages } from "../redux/messageSlice";
import getMessages from "../features/getMessages";

function ChatArea() {
  const { selectedConversation } = useSelector((state) => state.conversation);

  const conversationId = selectedConversation?._id;

  const dispatch = useDispatch();
  const store = useStore();

  const [loadingConversationId, setLoadingConversationId] = useState(null);

  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!conversationId) return;

    let active = true;

    const loadMessages = async () => {
      if (!active) return;

      const messagesBeforeFetch =
        store.getState().message.messagesByConversation[conversationId];

      if (!Array.isArray(messagesBeforeFetch)) {
        setLoadingConversationId(conversationId);
      } else {
        setLoadingConversationId(null);
      }

      setLoadError(null);

      try {
        const data = await getMessages(conversationId);

        const currentMessages =
          store.getState().message.messagesByConversation[conversationId];

        if (active && currentMessages === messagesBeforeFetch) {
          dispatch(
            setConversationMessages({
              conversationId,
              messages: data,
            }),
          );
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);

        if (active) {
          setLoadError({
            conversationId,
            message: "Unable to load chat history.",
          });
        }
      } finally {
        if (active) {
          setLoadingConversationId((current) =>
            current === conversationId ? null : current,
          );
        }
      }
    };

    // Run asynchronously to avoid synchronous state updates in the effect.
    Promise.resolve().then(loadMessages);

    return () => {
      active = false;
    };
  }, [conversationId, dispatch, store, retryCount]);

  const isLoading =
    Boolean(conversationId) && loadingConversationId === conversationId;

  const currentError =
    loadError && loadError.conversationId === conversationId
      ? loadError.message
      : "";

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col">
      <Nav />

      <MessageList
        isLoading={isLoading}
        loadError={currentError}
        onRetry={() => setRetryCount((count) => count + 1)}
      />

      <ChatInput />
    </div>
  );
}

export default ChatArea;
