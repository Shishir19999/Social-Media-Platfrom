import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Login() {
	const { login } = useAuth();
	const navigate = useNavigate();
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError("");
		try {
			await login(identifier, password);
			navigate("/");
		} catch (err) {
			setError(err.response?.data?.error || "Login failed");
		}
	};

	return (
		<form className="create-post" onSubmit={handleSubmit}>
			<h2>Login</h2>
			{error && <p className="error">{error}</p>}
			<input
				type="text"
				placeholder="Email or username"
				value={identifier}
				onChange={(e) => setIdentifier(e.target.value)}
				required
			/>
			<input
				type="password"
				placeholder="Password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				required
			/>
			<button type="submit">Login</button>
			<p>
				No account? <Link to="/register">Register</Link>
			</p>
		</form>
	);
}

export default Login;
