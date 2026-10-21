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
      <div className="flex-1 min-w-0 h-full">
        <ChatArea />
      </div>

      {/* Artifact */}
      <div className="hidden lg:flex w-[250px] shrink-0 h-full border-l border-white/[0.06]">
        <Artifact />
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