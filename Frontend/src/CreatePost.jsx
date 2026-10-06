// CreatePost.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./config";

function CreatePost() {
	const navigate = useNavigate();
	const [error, setError] = useState("");
	const [newPost, setNewPost] = useState({
		title: "",
		content: "",
		file: null,
	});

	const handleInputChange = (event) => {
		const { name, value } = event.target;
		setNewPost({ ...newPost, [name]: value });
	};

	const handleFileChange = (event) => {
		setNewPost({ ...newPost, file: event.target.files[0] || null });
	};

	const handlePostSubmit = () => {
		setError("");
		const formData = new FormData();
		formData.append("title", newPost.title);
		formData.append("content", newPost.content);
		if (newPost.file) formData.append("file", newPost.file);

		axios
			.post(`${API_URL}/api/posts`, formData)
			.then(() => {
				setNewPost({ title: "", content: "", file: null });
				navigate("/");
			})
			.catch((err) => setError(err.response?.data?.error || "Error creating post"));
	};

	return (
		<div className="create-post">
			<h2>Create a Post</h2>
			{error && <p className="error">{error}</p>}
			<input
				type="text"
				name="title"
				placeholder="Title"
				value={newPost.title}
				onChange={handleInputChange}
			/>
			<textarea
				name="content"
				placeholder="Content"
				value={newPost.content}
				onChange={handleInputChange}
			></textarea>
			<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} />
			<button onClick={handlePostSubmit}>Post</button>
		</div>
	);
}

export default CreatePost;
