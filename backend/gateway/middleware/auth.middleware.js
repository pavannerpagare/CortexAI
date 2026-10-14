import redis from "../../shared/redis/redis.js"

const protect = async (req, res, next) => {
    try {
        console.log("COOKIES:", req.cookies)

        const sessionId = req.cookies?.session

        console.log("SESSION ID:", sessionId)

        if (!sessionId) {
            return res.status(401).json({ message: "unauthorized" })
        }

        const session = await redis.get(`session-${sessionId}`)

        console.log("REDIS SESSION:", session)

        if (!session) {
            return res.status(401).json({ message: "session expired" })
        }

        req.user = JSON.parse(session)
        next()

    } catch (error) {
        console.error("PROTECT ERROR:", error)

        return res.status(500).json({
            message: `protect error ${error}`
        })
    }
}

export default protect