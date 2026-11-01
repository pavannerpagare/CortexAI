import axios from "axios"

export const getMessages = async (conversationId, userId) => {
    try {
        const {data} = await axios.get(
            `${process.env.CHAT_SERVICE}/get-messages/${conversationId}`,
            {
                headers: {
                    "x-gateway-secret": process.env.GATEWAY_SECRET,
                    "x-user-id": userId,
                },
            },
        )
        return data
    } catch (error) {
        console.error("GET MESSAGES ERROR:", error.message)
        throw error
    }
}