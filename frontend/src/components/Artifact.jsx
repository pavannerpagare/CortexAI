import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FileImage,
  FileText,
  LoaderCircle,
  Presentation,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useSelector } from "react-redux";
import api from "../../utils/axios";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "code", label: "Code" },
  { id: "pdf", label: "PDF" },
  { id: "ppt", label: "PPT" },
  { id: "image", label: "Images" },
];

const TYPE_LABELS = {
  code: "CODE",
  pdf: "PDF",
  ppt: "POWERPOINT",
  image: "IMAGE",
  file: "FILE",
};

const getArtifactType = (artifact) => {
  if (artifact.artifactType) return artifact.artifactType;

  const contentType = String(
    artifact.contentType || ""
  ).toLowerCase();

  const filename = String(
    artifact.filename || ""
  ).toLowerCase();

  if (
    contentType.includes("pdf") ||
    filename.endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    contentType.includes("presentation") ||
    filename.endsWith(".pptx")
  ) {
    return "ppt";
  }

  if (contentType.startsWith("image/")) {
    return "image";
  }

  if (
    contentType.startsWith("text/") ||
    /\.(js|jsx|ts|tsx|py|cpp|java|html|css|sql|json)$/.test(
      filename
    )
  ) {
    return "code";
  }

  return "file";
};

const getArtifactIcon = (type) => {
  if (type === "code") return Code2;
  if (type === "pdf") return FileText;
  if (type === "ppt") return Presentation;
  if (type === "image") return FileImage;
  return FileText;
};

const formatDate = (value) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getImageUrl = (image) => {
  if (typeof image === "string") return image;

  return (
    image?.url ||
    image?.image_url ||
    image?.src ||
    ""
  );
};

/* --------------------------------------------------
   POWERPOINT PREVIEW
-------------------------------------------------- */

function PowerPointPreview({ blob, filename }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);

  const [slideCount, setSlideCount] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let viewer;

    const renderPresentation = async () => {
      try {
        setError("");

        const { PPTXViewer } = await import("pptxviewjs");

        if (!active || !canvasRef.current) return;

        viewer = new PPTXViewer({
          canvas: canvasRef.current,
        });

        const file = new File(
          [blob],
          filename || "presentation.pptx",
          {
            type:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }
        );

        await viewer.loadFile(file);
        await viewer.render();

        if (!active) return;

        viewerRef.current = viewer;

        setSlideCount(
          Number(viewer.getSlideCount?.() || 0)
        );

        setCurrentSlide(
          Number(viewer.getCurrentSlideIndex?.() || 0)
        );
      } catch (previewError) {
        console.error(
          "PowerPoint preview failed:",
          previewError
        );

        if (active) {
          setError(
            "This presentation could not be rendered in the browser. Download it to view in PowerPoint."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    Promise.resolve().then(renderPresentation);

    return () => {
      active = false;
      viewerRef.current = null;

      if (typeof viewer?.destroy === "function") {
        viewer.destroy();
      }
    };
  }, [blob, filename]);

  const goToSlide = async (direction) => {
    const viewer = viewerRef.current;

    if (!viewer) return;

    try {
      if (direction < 0) {
        await viewer.previousSlide();
      } else {
        await viewer.nextSlide();
      }

      setCurrentSlide(
        Number(viewer.getCurrentSlideIndex?.() || 0)
      );
    } catch (navigationError) {
      console.error(
        "Slide navigation failed:",
        navigationError
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-[#090b10] p-2">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="block h-auto max-h-[65vh] w-full rounded-lg object-contain"
          aria-label={`Preview of ${filename}`}
        />

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
            <LoaderCircle
              size={15}
              className="animate-spin"
            />
            Rendering slides...
          </div>
        )}

        {error && (
          <p className="px-2 py-4 text-xs text-amber-300">
            {error}
          </p>
        )}
      </div>

      {slideCount > 0 && !error && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <button
            type="button"
            onClick={() => goToSlide(-1)}
            disabled={currentSlide <= 0 || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
            Previous
          </button>

          <span>
            Slide {currentSlide + 1} of {slideCount}
          </span>

          <button
            type="button"
            onClick={() => goToSlide(1)}
            disabled={
              currentSlide >= slideCount - 1 || loading
            }
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 disabled:opacity-30"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------
   ARTIFACT WORKSPACE
-------------------------------------------------- */

function Artifact() {
  const selectedConversation = useSelector(
    (state) => state.conversation.selectedConversation
  );

  const messagesByConversation = useSelector(
    (state) => state.message.messagesByConversation
  );

  const [artifacts, setArtifacts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [scope, setScope] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [preview, setPreview] = useState({
    kind: "empty",
  });
  const [copyDone, setCopyDone] = useState(false);

  const conversationId = selectedConversation?._id;

  /* Local artifacts from conversation messages */

  const localArtifacts = useMemo(() => {
    return Object.entries(
      messagesByConversation || {}
    ).flatMap(
      ([messageConversationId, messages]) =>
        (Array.isArray(messages) ? messages : []).flatMap(
          (message) =>
            (message.artifacts || []).map((artifact) => ({
              ...artifact,
              conversationId: messageConversationId,
              createdAt:
                message.createdAt || artifact.createdAt,
              artifactType: getArtifactType(artifact),
            }))
        )
    );
  }, [messagesByConversation]);

  /* Images attached to messages */

  const imageReferences = useMemo(() => {
    return Object.entries(
      messagesByConversation || {}
    ).flatMap(
      ([messageConversationId, messages]) =>
        (Array.isArray(messages) ? messages : []).flatMap(
          (message, messageIndex) =>
            (message.images || [])
              .map((image, imageIndex) => {
                const url = getImageUrl(image);

                if (!url) return null;

                return {
                  artifactId: `image-ref-${messageConversationId}-${messageIndex}-${imageIndex}`,
                  filename:
                    image?.filename ||
                    `Search image ${imageIndex + 1}`,
                  artifactType: "image",
                  contentType: "image/url",
                  externalUrl: url,
                  conversationId: messageConversationId,
                  createdAt: message.createdAt,
                };
              })
              .filter(Boolean)
        )
    );
  }, [messagesByConversation]);

  /* Load server artifacts */

  const loadArtifacts = useCallback(async () => {
    setLoadingList(true);
    setListError("");

    try {
      const params =
        scope === "conversation" && conversationId
          ? { conversationId }
          : {};

      const { data } = await api.get(
        "/api/agent/artifacts",
        { params }
      );

      const serverArtifacts = Array.isArray(
        data?.artifacts
      )
        ? data.artifacts
        : [];

      setArtifacts(serverArtifacts);
    } catch (error) {
      console.error("Artifact list failed:", error);

      setListError(
        error?.response?.data?.message ||
          "Unable to load your artifacts."
      );
    } finally {
      setLoadingList(false);
    }
  }, [scope, conversationId]);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(() => {
      if (active) {
        loadArtifacts();
      }
    });

    return () => {
      active = false;
    };
  }, [loadArtifacts]);

  /* Combine server and local artifacts without extra state effects */

  const visibleArtifacts = useMemo(() => {
    const combined = new Map();

    for (const item of artifacts) {
      combined.set(item.artifactId, item);
    }

    for (const item of localArtifacts) {
      combined.set(item.artifactId, {
        ...combined.get(item.artifactId),
        ...item,
      });
    }

    for (const image of imageReferences) {
      if (!combined.has(image.artifactId)) {
        combined.set(image.artifactId, image);
      }
    }

    return [...combined.values()]
      .filter(
        (artifact) =>
          filter === "all" ||
          getArtifactType(artifact) === filter
      )
      .filter((artifact) => {
        if (
          scope === "conversation" &&
          conversationId &&
          artifact.conversationId !== conversationId
        ) {
          return false;
        }

        return String(
          artifact.filename || ""
        )
          .toLowerCase()
          .includes(search.toLowerCase());
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0) -
          new Date(a.createdAt || 0)
      );
  }, [
    artifacts,
    localArtifacts,
    imageReferences,
    filter,
    scope,
    conversationId,
    search,
  ]);

  /* Selected artifact is derived from current visible list */

  const selectedArtifact = previewOpen
    ? visibleArtifacts.find(
        (artifact) =>
          artifact.artifactId === selectedId
      ) ||
      visibleArtifacts[0] ||
      null
    : null;

  /* Load selected artifact preview */

  useEffect(() => {
    if (!selectedArtifact) return undefined;

    let active = true;
    let objectUrl = "";

    const artifactType = getArtifactType(
      selectedArtifact
    );

    const loadPreview = async () => {
      setPreview({ kind: "loading" });

      if (selectedArtifact.externalUrl) {
        setPreview({
          kind: "image",
          src: selectedArtifact.externalUrl,
        });
        return;
      }

      try {
        const { data: blob } = await api.get(
          `/api/agent/artifacts/${encodeURIComponent(
            selectedArtifact.artifactId
          )}/preview`,
          {
            responseType: "blob",
          }
        );

        if (!active) return;

        if (artifactType === "code") {
          const text = await blob.text();

          if (active) {
            setPreview({
              kind: "code",
              text,
            });
          }

          return;
        }

        if (artifactType === "ppt") {
          setPreview({
            kind: "ppt",
            blob,
          });
          return;
        }

        objectUrl = window.URL.createObjectURL(blob);

        if (artifactType === "image") {
          setPreview({
            kind: "image",
            src: objectUrl,
          });
        } else if (artifactType === "pdf") {
          setPreview({
            kind: "pdf",
            src: objectUrl,
          });
        } else {
          setPreview({
            kind: "unsupported",
          });
        }
      } catch (error) {
        console.error(
          "Artifact preview failed:",
          error
        );

        if (active) {
          setPreview({
            kind: "error",
            message:
              error?.response?.data?.message ||
              "Unable to preview this artifact.",
          });
        }
      }
    };

    Promise.resolve().then(loadPreview);

    return () => {
      active = false;

      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedArtifact]);

  /* Download artifact */

  const handleDownload = async (artifact) => {
    if (!artifact) return;

    if (artifact.externalUrl) {
      window.open(
        artifact.externalUrl,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    try {
      const { data } = await api.get(
        `/api/agent/artifacts/${encodeURIComponent(
          artifact.artifactId
        )}/download`,
        {
          responseType: "blob",
        }
      );

      const objectUrl =
        window.URL.createObjectURL(data);

      const link = document.createElement("a");

      link.href = objectUrl;
      link.download =
        artifact.filename || "cortexai-artifact";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(
        () => window.URL.revokeObjectURL(objectUrl),
        1000
      );
    } catch (error) {
      console.error(
        "Artifact download failed:",
        error
      );

      setPreview({
        kind: "error",
        message:
          "Download failed. Please refresh and try again.",
      });
    }
  };

  /* Copy code */

  const handleCopy = async () => {
    if (preview.kind !== "code") return;

    try {
      await navigator.clipboard.writeText(
        preview.text
      );

      setCopyDone(true);

      window.setTimeout(
        () => setCopyDone(false),
        1500
      );
    } catch (error) {
      console.error("Code copy failed:", error);

      setPreview((current) => ({
        ...current,
        copyError:
          "Clipboard access was blocked by the browser.",
      }));
    }
  };

  const selectedType = selectedArtifact
    ? getArtifactType(selectedArtifact)
    : "";

  /* --------------------------------------------------
     RENDER
  -------------------------------------------------- */

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0d0f14] text-slate-100">
      {/* Header */}

      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide">
            Artifact Workspace
          </h2>

          <p className="mt-1 text-[11px] text-slate-500">
            Your generated files and previews
          </p>
        </div>

        <button
          type="button"
          onClick={loadArtifacts}
          disabled={loadingList}
          aria-label="Refresh artifacts"
          title="Refresh artifacts"
          className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          <RefreshCw
            size={14}
            className={
              loadingList ? "animate-spin" : ""
            }
          />
        </button>
      </div>

      {/* Search and filters */}

      <div className="space-y-3 border-b border-white/[0.07] px-3 py-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Find an artifact..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
          />
        </div>

        <select
          value={scope}
          onChange={(event) =>
            setScope(event.target.value)
          }
          className="w-full rounded-lg border border-white/10 bg-[#151923] px-3 py-2 text-xs text-slate-300 outline-none"
          aria-label="Artifact scope"
        >
          <option value="all">
            All conversations
          </option>

          <option
            value="conversation"
            disabled={!conversationId}
          >
            Current conversation
          </option>
        </select>

        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-medium transition ${
                filter === item.id
                  ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                  : "border-white/10 text-slate-500 hover:bg-white/5 hover:text-slate-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Artifact list and preview */}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#303747_transparent]">
        {listError && (
          <div
            className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5 text-[11px] text-amber-200"
            role="alert"
          >
            {listError}
          </div>
        )}

        {loadingList && visibleArtifacts.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
            <LoaderCircle
              size={15}
              className="animate-spin"
            />
            Loading artifacts...
          </div>
        ) : visibleArtifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-500">
              <FileImage size={22} />
            </div>

            <p className="text-xs font-medium text-slate-300">
              No artifacts yet
            </p>

            <p className="text-[11px] leading-relaxed text-slate-600">
              Generate code, PDF reports, presentations or analyze an image to see files here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {visibleArtifacts.length}{" "}
              {visibleArtifacts.length === 1
                ? "artifact"
                : "artifacts"}
            </div>

            {visibleArtifacts.map((artifact) => {
              const type = getArtifactType(artifact);
              const Icon = getArtifactIcon(type);

              const active =
                selectedArtifact?.artifactId ===
                artifact.artifactId;

              return (
                <button
                  key={artifact.artifactId}
                  type="button"
                  onClick={() => {
                    setSelectedId(
                      artifact.artifactId
                    );
                    setPreviewOpen(true);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                    active
                      ? "border-indigo-400/35 bg-indigo-500/[0.09]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-lg p-2 ${
                      active
                        ? "bg-indigo-500/15 text-indigo-300"
                        : "bg-white/[0.05] text-slate-400"
                    }`}
                  >
                    <Icon size={15} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-200">
                      {artifact.filename ||
                        "Untitled artifact"}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                      <span>
                        {TYPE_LABELS[type] || "FILE"}
                      </span>

                      <span>·</span>

                      <span>
                        {formatDate(artifact.createdAt)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected artifact preview */}

        {selectedArtifact && (
          <section className="mt-4 border-t border-white/[0.07] pt-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-300">
                  Preview
                </p>

                <h3 className="mt-1 break-words text-xs font-semibold text-slate-100">
                  {selectedArtifact.filename}
                </h3>

                <p className="mt-1 text-[10px] text-slate-500">
                  {TYPE_LABELS[selectedType] || "FILE"}
                  {" · "}
                  {formatDate(selectedArtifact.createdAt)}

                  {selectedType === "ppt" &&
                  selectedArtifact.metadata?.slideCount
                    ? ` · ${selectedArtifact.metadata.slideCount} slides`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close artifact preview"
                className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            {preview.kind === "loading" && (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-8 text-xs text-slate-500">
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                />
                Loading preview...
              </div>
            )}

            {preview.kind === "error" && (
              <p
                className="rounded-lg border border-red-400/20 bg-red-400/[0.06] p-3 text-xs text-red-300"
                role="alert"
              >
                {preview.message}
              </p>
            )}

            {/* PDF preview */}

            {preview.kind === "pdf" && (
              <iframe
                title={`PDF preview: ${selectedArtifact.filename}`}
                src={preview.src}
                className="h-[65vh] min-h-[520px] w-full rounded-lg border border-white/10 bg-white"
              />
            )}

            {/* Image preview */}

            {preview.kind === "image" && (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20 p-1">
                <img
                  src={preview.src}
                  alt={
                    selectedArtifact.filename ||
                    "Artifact preview"
                  }
                  className="max-h-[65vh] w-full rounded-lg object-contain"
                  loading="lazy"
                />
              </div>
            )}

            {/* Code preview */}

            {preview.kind === "code" && (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080a0f]">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {selectedArtifact.language || "text"}
                  </span>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5"
                  >
                    {copyDone ? (
                      <Check size={12} />
                    ) : (
                      <Copy size={12} />
                    )}

                    {copyDone ? "Copied" : "Copy"}
                  </button>
                </div>

                <pre className="max-h-[65vh] min-h-[520px] overflow-auto whitespace-pre p-4 text-[13px] leading-6 text-emerald-100 [scrollbar-width:thin]">
                  <code>{preview.text}</code>
                </pre>

                {preview.copyError && (
                  <p className="px-3 pb-2 text-[10px] text-amber-300">
                    {preview.copyError}
                  </p>
                )}
              </div>
            )}

            {/* PowerPoint preview */}

            {preview.kind === "ppt" && (
              <PowerPointPreview
                key={selectedArtifact.artifactId}
                blob={preview.blob}
                filename={selectedArtifact.filename}
              />
            )}

            {preview.kind === "unsupported" && (
              <p className="rounded-lg border border-white/10 p-3 text-xs text-slate-500">
                Browser preview is not available for this file type. Download the file to open it.
              </p>
            )}

            {/* Download */}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  handleDownload(selectedArtifact)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-indigo-500"
              >
                <ArrowDownToLine size={13} />
                Download
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

export default Artifact;
