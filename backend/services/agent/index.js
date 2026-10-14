import express, { Router } from "express"
import dotenv from "dotenv"
import connectDb from "./config/db.js"
import router from "./routes/agent.route.js"

dotenv.config()

const port = process.env.PORT

const app = express()

app.use(express.json())

app.use("/", router)

app.get("/", (req,res)=> {
    res.json({message:"hello from agent"})
})

app.listen(port, () => {
    console.log(`agent started at ${port}`)
    connectDb()
})
