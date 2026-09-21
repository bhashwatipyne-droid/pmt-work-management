import { createContext, useContext, useEffect, useState } from "react";
import {
  clearAuthToken,
  getUsers,
  getMe,
  loginUser,
  logoutUser,
  setAuthToken,
  updateProfile,
} from "@/services/api";

import {
  trackEvent,
  identifyUser,
  resetAnalytics,
} from "@/analytics";
import { unregisterPush } from "@/lib/push";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [authUser, setAuthUser] = useState(null); // null = checking/logged-out, object = logged in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // /auth/me and /users don't depend on each other, so ask for both at the
    // same time. They used to run one after the other, and every page waits
    // for this whole step before it can render anything - so on a slow or
    // sleeping backend the second round trip was added to every page load.
    // A failure is non-fatal: dropdowns will just be empty.
    const usersRequest = getUsers().catch(() => []);

    getMe()
      .then(async (data) => {
        setAuthUser(data);

        identifyUser(data);

        trackEvent("session_restored", {
          user_id: String(data.id),
          role: data.role,
        });

        setUsers(await usersRequest);
      })
      .catch((error) => {
        // Drop a stored fallback token once the server says it's no longer valid.
        if (error?.response?.status === 401) clearAuthToken();
        setAuthUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { access_token: accessToken, ...data } = await loginUser(
      email,
      password
    );

    // Cookie first. Only if this browser refused the cross-site cookie (the
    // check below fails right after a successful login) fall back to sending
    // the token as a Bearer header.
    clearAuthToken();
    try {
      await getMe();
    } catch (_) {
      if (accessToken) setAuthToken(accessToken);
    }

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

    // Must run while the session cookie is still valid.
    await unregisterPush();

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

    clearAuthToken();
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