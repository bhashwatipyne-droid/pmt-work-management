import { createContext, useContext, useEffect, useState } from "react";
import { getUsers, getMe, loginUser, logoutUser } from "@/services/api";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [authUser, setAuthUser] = useState(null); // null = checking/logged-out, object = logged in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(async (data) => {
        setAuthUser(data);
        try {
          setUsers(await getUsers());
        } catch (_) {
          // non-fatal, dropdowns will just be empty
        }
      })
      .catch(() => setAuthUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await loginUser(email, password);
    setAuthUser(data);
    try {
      setUsers(await getUsers());
    } catch (_) {}
    return data;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (_) {}
    setAuthUser(null);
    setUsers([]);
  };

  const currentUser = authUser;
  const currentUserId = authUser?.id || "";

  return (
    <UserContext.Provider
      value={{ users, currentUser, currentUserId, loading, isAuthenticated: !!authUser, login, logout }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
