import api from "../../utils/axios";

export default async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const { data } = await api.post(
      "/api/agent/documents/upload",
      formData
    );

    return data;
  } catch (error) {
    const status = error.response?.status;

    const message =
      status === 413
        ? "File is too large. Please upload a document smaller than 8 MB."
        : error.response?.data?.message ||
          error.message ||
          "Document upload failed. Check that the Agent service is running.";

    throw new Error(message, { cause: error });
  }
}