import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setUserData } from "./redux/userSlice";

import Home from "./pages/Home";
import getCurrentUser from "./features/getCurrentUser";

function App() {

  const dispatch = useDispatch()
  useEffect(() => {
    const getUser = async () => {
      const data = await getCurrentUser()
      dispatch(setUserData(data))
    }
    getUser()
  }, [])

  return (
    <>
      <Home />
    </>
  )
}

export default App;