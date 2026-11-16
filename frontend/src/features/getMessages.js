import api from "../../utils/axios";

async function getMessages(id) {
  try {
    const { data } = await api.get(
      `/api/chat/get-messages/${encodeURIComponent(id)}`
    );

    return data;
  } catch (error) {
    console.error("Failed to fetch conversation messages:", error);
    throw error;
  }
}

export default getMessages;