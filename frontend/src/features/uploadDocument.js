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
    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Document upload failed. Check that the Agent service is running.",
      { cause: error }
    );
  }
}