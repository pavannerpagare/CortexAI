import { createSlice } from "@reduxjs/toolkit";

const messageSlice = createSlice({
  name: "message",

  initialState: {
    messages: [],

    messagesByConversation: {},
  },

  reducers: {
    setMessages: (state, action) => {
      state.messages = action.payload;
    },

    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },

    setConversationMessages: (state, action) => {
      const { conversationId, messages } = action.payload;

      if (!conversationId) return;

      state.messagesByConversation[conversationId] =
        Array.isArray(messages) ? messages : [];
    },

    addMessageToConversation: (state, action) => {
      const { conversationId, message } = action.payload;

      if (!conversationId) return;

      if (!state.messagesByConversation[conversationId]) {
        state.messagesByConversation[conversationId] = [];
      }

      state.messagesByConversation[conversationId].push(message);
    },

    removeConversationMessages: (state, action) => {
      delete state.messagesByConversation[action.payload];
    },
  },
});

export const {
  setMessages,
  addMessage,
  setConversationMessages,
  addMessageToConversation,
  removeConversationMessages,
} = messageSlice.actions;

export default messageSlice.reducer;