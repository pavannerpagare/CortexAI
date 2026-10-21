import express from "express"
import { login, logOut } from "../controllers/auth.controller.js"

const router = express.Router()

router.post("/login", login)
router.post("/logout", logOut)

export default router