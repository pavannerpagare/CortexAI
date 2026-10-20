import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "serviceAccountKey.json");

if (!existsSync(keyPath)) {
  throw new Error(
    "serviceAccountKey.json is missing at backend/services/auth/serviceAccountKey.json. " +
      "Copy serviceAccountKey.example.json, fill in your Firebase Admin credentials, and rename it.",
  );
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (error) {
  throw new Error(`Failed to parse serviceAccountKey.json: ${error.message}`);
}

const PLACEHOLDER_FIELDS = ["project_id", "private_key", "client_email"];
const stillPlaceholder = PLACEHOLDER_FIELDS.some(
  (field) =>
    !serviceAccount[field] ||
    String(serviceAccount[field]).startsWith("REPLACE"),
);

if (stillPlaceholder) {
  throw new Error(
    "serviceAccountKey.json still contains REPLACE_* placeholders. " +
      "Replace them with real Firebase Admin credentials before starting the auth service.",
  );
}

export const app = initializeApp({
  credential: cert(serviceAccount),
});
