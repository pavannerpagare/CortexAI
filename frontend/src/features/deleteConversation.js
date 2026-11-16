import api from "../../utils/axios";

export const deleteConversation = async (conversationId) => {
  try {
    const { data } = await api.delete(
      `/api/chat/delete-conversation/${encodeURIComponent(conversationId)}`
    );
    return data;
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    throw error;
  }
};