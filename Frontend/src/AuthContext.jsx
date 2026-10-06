import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_URL } from "./config";

const AuthContext = createContext(null);
const STORAGE_KEY = "social_auth";

function loadStored() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { token: null, user: null };
	} catch {
		return { token: null, user: null };
	}
}

export function AuthProvider({ children }) {
	const [auth, setAuth] = useState(loadStored);

	useEffect(() => {
		const id = axios.interceptors.request.use((config) => {
			if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
			return config;
		});
		return () => axios.interceptors.request.eject(id);
	}, [auth.token]);

	const persist = useCallback((data) => {
		setAuth(data);
		try {
			if (data.token) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
			else localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* storage unavailable */
		}
	}, []);

	const login = async (identifier, password) => {
		const { data } = await axios.post(`${API_URL}/api/auth/login`, { identifier, password });
		persist({ token: data.token, user: data.user });
	};

	const register = async (username, email, password) => {
		const { data } = await axios.post(`${API_URL}/api/auth/register`, { username, email, password });
		persist({ token: data.token, user: data.user });
	};

	// Revoke the token on the server (best effort), then clear local state.
	const logout = async () => {
		try {
			await axios.post(`${API_URL}/api/auth/logout`, null, {
				headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
			});
		} catch {
			/* token already invalid or server unreachable: sign out locally anyway */
		}
		persist({ token: null, user: null });
	};

	// If the server rejects our token (revoked or expired), sign out locally.
	useEffect(() => {
		const id = axios.interceptors.response.use(
			(res) => res,
			(err) => {
				const url = err.config?.url || "";
				if (err.response?.status === 401 && auth.token && !url.includes("/api/auth/")) {
					persist({ token: null, user: null });
				}
				return Promise.reject(err);
			}
		);
		return () => axios.interceptors.response.eject(id);
	}, [auth.token, persist]);

	return (
		<AuthContext.Provider value={{ user: auth.user, token: auth.token, login, register, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
	return useContext(AuthContext);
}
