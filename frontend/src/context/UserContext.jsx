import { createContext, useContext, useEffect, useState } from "react";
import {
  getUsers,
  getMe,
  loginUser,
  logoutUser,
  updateProfile,
} from "@/services/api";

import {
  trackEvent,
  identifyUser,
  resetAnalytics,
} from "@/analytics";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [authUser, setAuthUser] = useState(null); // null = checking/logged-out, object = logged in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(async (data) => {
        setAuthUser(data);

        identifyUser(data);

        trackEvent("session_restored", {
          user_id: String(data.id),
          role: data.role,
        });

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

    identifyUser(data);

    trackEvent("login_success", {
      user_id: String(data.id),
      role: data.role,
      login_method: "password",
    });

    try {
      setUsers(await getUsers());
    } catch (_) {}

    return data;
  };

  const logout = async () => {
    const user = authUser;

    try {
      await logoutUser();

      trackEvent("logout_success", {
        user_id: user?.id ? String(user.id) : undefined,
        role: user?.role,
      });
    } catch (_) {
      trackEvent("logout_failed", {
        user_id: user?.id ? String(user.id) : undefined,
        role: user?.role,
      });
    }

    resetAnalytics();

    setAuthUser(null);
    setUsers([]);
  };

  const updateCurrentUserProfile = async (payload) => {
    const data = await updateProfile(payload);
    setAuthUser(data);
    return data;
  };

  const currentUser = authUser;
  const currentUserId = authUser?.id || "";

  return (
    <UserContext.Provider
      value={{ users, currentUser, currentUserId, loading, isAuthenticated: !!authUser, login, logout, updateCurrentUserProfile }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);