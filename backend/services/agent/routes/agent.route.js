import express from "express";
import { agent } from "../controllers/agent.controller.js";

import { uploadSingleDocument } from "../middleware/documentUpload.js";
import {
  getRagDocuments,
  removeRagDocument,
  uploadRagDocument,
} from "../controllers/document.controller.js";
import {
  downloadArtifact,
  listArtifacts,
  previewArtifact,
} from "../controllers/artifact.controller.js";

const router = express.Router();

router.post("/chat", agent);
router.post("/documents/upload", uploadSingleDocument, uploadRagDocument);
router.get("/documents", getRagDocuments);
router.delete("/documents/:documentId", removeRagDocument);
router.get("/artifacts", listArtifacts);
router.get("/artifacts/:artifactId/preview", previewArtifact);
router.get("/artifacts", listArtifacts);
router.get("/artifacts/:artifactId/preview", previewArtifact);
router.get("/artifacts/:artifactId/download", downloadArtifact);
export default router;
