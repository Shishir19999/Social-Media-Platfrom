// App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './Home';
import CreatePost from './CreatePost';
import Login from './Login';
import Register from './Register';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider, useAuth } from './AuthContext';
import './App.css';

function Nav() {
	const { user, logout } = useAuth();
	return (
		<nav>
			<ul>
				<li>
					<Link to="/">Home</Link>
				</li>
				{user ? (
					<>
						<li>
							<Link to="/create">Create Post</Link>
						</li>
						<li>Signed in as {user.username}</li>
						<li>
							<button onClick={logout}>Logout</button>
						</li>
					</>
				) : (
					<>
						<li>
							<Link to="/login">Login</Link>
						</li>
						<li>
							<Link to="/register">Register</Link>
						</li>
					</>
				)}
			</ul>
		</nav>
	);
}

function App() {
	return (
		<AuthProvider>
			<Router>
				<div className="app">
					<Nav />
					<Routes>
						<Route
							path="/create"
							element={
								<ProtectedRoute>
									<CreatePost />
								</ProtectedRoute>
							}
						/>
						<Route path="/login" element={<Login />} />
						<Route path="/register" element={<Register />} />
						<Route path="/" element={<Home />} />
					</Routes>
				</div>
			</Router>
		</AuthProvider>
	);
}

export default App;
