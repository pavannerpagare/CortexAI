import redis from "../../shared/redis/redis.js";

const protect = async (req, res, next) => {
  try {
    const sessionId = req.cookies?.session;

    if (!sessionId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    delete req.headers["x-user-id"];

    const session = await redis.get(`session-${sessionId}`);

    if (!session) {
      return res.status(401).json({ message: "session expired" });
    }

    let parsedSession;
    try {
      parsedSession = JSON.parse(session);
    } catch {
      return res.status(401).json({ message: "session expired" });
    }

    if (!parsedSession?.userId) {
      return res.status(401).json({ message: "session expired" });
    }

    req.user = parsedSession;
    req.userId = String(parsedSession.userId);
    delete req.headers["x-user-id"];
    return next();
  } catch (error) {
    return res.status(500).json({
      message: "protect error",
    });
  }
};

export default protect;
