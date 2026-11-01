import api from "../../utils/axios";

async function sendMessage(payload) {
  try {
    const { data } = await api.post("/api/agent/chat", payload);
    return data;
  } catch (error) {
    throw new Error("Failed to send message", {
        cause: error
    });
}
}

export default sendMessage;