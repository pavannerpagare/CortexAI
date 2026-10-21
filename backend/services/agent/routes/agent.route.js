import express from "express"
import { agent } from "../controllers/agent.controller.js"

import { uploadSingleDocument } from "../middleware/documentUpload.js";
import {
  getRagDocuments,
  removeRagDocument,
  uploadRagDocument,
} from "../controllers/document.controller.js";

const router = express.Router()

router.post("/chat", agent)
router.post("/documents/upload", uploadSingleDocument, uploadRagDocument);
router.get("/documents", getRagDocuments);
router.delete("/documents/:documentId", removeRagDocument);

export default router