import { getAuth } from "firebase-admin/auth";
import { app } from "../auth/config/firebase.js";
import User from "../models/user.model.js";
import crypto from "crypto";
import redis from "../../shared/redis/redis.js";

export const login = async (req, res) => {
  try {
    const { token } = req.body;

    console.log("TOKEN RECEIVED:", !!token);

    const decoded = await getAuth(app).verifyIdToken(token);

    console.log("FIREBASE USER:", decoded.email);

    let user = await User.findOne({
      firebaseUid: decoded.uid,
    });

    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        name: decoded.name,
        email: decoded.email,
        avatar: decoded.picture,
      });
    }

    const sessionId = crypto.randomUUID();
    await redis.set(
      `session-${sessionId}`,
      JSON.stringify({
        userId: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      }),
      "EX",
      7 * 24 * 60 * 60,
    );

    // console.log("SESSION STORED:", 
    //     await redis.get(`session-${sessionId}`)
    // );

    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json(user);
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);

    return res.status(500).json({
      message: error.message,
    });
  }
};

export const logOut = async (req, res) => {
  try {
    const sessionId = req.cookies?.session;
    await redis.del(`session-${sessionId}`);

    res.clearCookie("session");
    return res.status(200).json({ message: "logout successfully" });
  } catch (error) {
    return res.status(500).json({
      message: `logout error ${error}`,
    });
  }
};
