import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Register() {
	const { register } = useAuth();
	const navigate = useNavigate();
	const [form, setForm] = useState({ username: "", email: "", password: "" });
	const [error, setError] = useState("");

	const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError("");
		try {
			await register(form.username, form.email, form.password);
			navigate("/");
		} catch (err) {
			setError(err.response?.data?.error || "Registration failed");
		}
	};

	return (
		<form className="create-post" onSubmit={handleSubmit}>
			<h2>Register</h2>
			{error && <p className="error">{error}</p>}
			<input name="username" type="text" placeholder="Username" value={form.username} onChange={handleChange} required minLength={3} />
			<input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
			<input name="password" type="password" placeholder="Password (min 6 chars)" value={form.password} onChange={handleChange} required minLength={6} />
			<button type="submit">Register</button>
			<p>
				Already registered? <Link to="/login">Login</Link>
			</p>
		</form>
	);
}

export default Register;
