function Artifact({ artifacts = [] }) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return null;
  }

  return (
    <aside className="hidden h-full w-[250px] shrink-0 overflow-hidden border-l border-white/[0.06] bg-[#0d0f14] lg:flex lg:flex-col">
      <div className="flex h-full flex-col overflow-y-auto p-3 text-sm text-slate-200">
        {artifacts.map((artifact, index) => (
          <div key={`${artifact.id ?? "artifact"}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            {artifact.title || "Artifact"}
          </div>
        ))}
      </div>
    </aside>
  );
}

export default Artifact;
