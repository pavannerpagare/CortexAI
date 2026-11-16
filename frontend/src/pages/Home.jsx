import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../utils/firebase";
import api from "../../utils/axios";
import { FcGoogle } from "react-icons/fc";
import { useSelector, useDispatch } from "react-redux";

import getCurrentUser from "../features/getCurrentUser";
import { setUserData } from "../redux/userSlice";

import ChatArea from "../components/ChatArea";
import Artifact from "../components/Artifact";
import SideBar from "../components/SideBar";

function Home() {
  const [artifactOpen, setArtifactOpen] = useState(true);
  const { userData } = useSelector((state) => state.user);
  const dispatch = useDispatch();

  console.log("USER:", userData);

  const handleLogin = async (token) => {
    try {
      await api.post("/api/auth/login", { token });

      const user = await getCurrentUser();

      dispatch(setUserData(user));
    } catch (error) {
      console.log(error);
    }
  };

  const googleLogin = async () => {
    try {
      const data = await signInWithPopup(auth, googleProvider);

      const token = await data.user.getIdToken();

      await handleLogin(token);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="h-screen flex bg-[#0d0f14] text-white overflow-hidden">
      {/* Sidebar */}
      <SideBar />

      {/* Chat Area */}
      <div className="relative flex-1 min-w-0 h-full">
        <ChatArea />

        {/* Artifact Sidebar Toggle */}
        <button
          type="button"
          onClick={() => setArtifactOpen((open) => !open)}
          aria-label={
            artifactOpen
              ? "Close Artifact Workspace"
              : "Open Artifact Workspace"
          }
          aria-expanded={artifactOpen}
          aria-controls="artifact-workspace-panel"
          title={artifactOpen ? "Close artifacts" : "Open artifacts"}
          className="hidden xl:inline-flex absolute top-3 right-3 z-30
    items-center justify-center rounded-lg border border-white/10
    bg-[#151923] p-2 text-slate-400 transition
    hover:bg-indigo-500/20 hover:text-white"
        >
          {artifactOpen ? (
            <PanelRightClose size={18} />
          ) : (
            <PanelRightOpen size={18} />
          )}
        </button>
      </div>

      {/* Collapsible Artifact Workspace */}
      <div
        id="artifact-workspace-panel"
        className={`hidden xl:flex h-full shrink-0 overflow-hidden
  border-l border-white/[0.06]
  transition-[width] duration-300 ease-in-out ${
    artifactOpen ? "w-[480px]" : "w-0 border-l-0"
  }`}
      >
        <div className="h-full w-[480px] min-w-[480px]">
          <Artifact />
        </div>
      </div>

      {/* Login Modal */}
      {!userData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur">
          <div className="w-[340px] bg-[#13151c] border border-white/[0.08] rounded-2xl p-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-[17px] font-semibold text-slate-100 tracking-tight">
                Welcome to CortexAI
              </h2>

              <p className="text-[13px] text-slate-500">
                Please login to continue using the app
              </p>
            </div>

            <button
              className="w-full flex items-center justify-center gap-3 py-[11px] rounded-xl text-sm font-medium text-black/90 bg-white hover:bg-gray-200 transition-all duration-150 cursor-pointer"
              onClick={googleLogin}
            >
              <FcGoogle size={15} />
              Continue With Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
