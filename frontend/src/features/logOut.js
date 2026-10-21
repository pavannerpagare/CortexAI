import api from '../../utils/axios'

async function logOut() {
  try {
    const {data} = await api.post("/api/auth/logout")
    console.log(data)
  } catch (error) {
    console.log(error)
  }
}

export default logOut