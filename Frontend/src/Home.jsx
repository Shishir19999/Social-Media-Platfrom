// Home.js

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_URL } from "./config";
import { useAuth } from "./AuthContext";

function Attachment({ file }) {
	const url = `${API_URL}/uploads/${file}`;
	const lower = file.toLowerCase();
	if (lower.endsWith(".pdf")) {
		return (
			<a href={url} target="_blank" rel="noreferrer">
				View attached PDF
			</a>
		);
	}
	if (lower.endsWith(".mp4")) {
		return (
			<video width="320" height="240" controls>
				<source src={url} type="video/mp4" />
				Your browser does not support the video tag.
			</video>
		);
	}
	return <img src={url} alt="Post Media" />;
}

function Home() {
	const { user } = useAuth();
	const [commentInputs, setCommentInputs] = useState({});
	const [posts, setPosts] = useState([]);
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(1);
	const [error, setError] = useState("");
	const [editing, setEditing] = useState(null); // { id, title, content }

	const loadPosts = useCallback(() => {
		axios
			.get(`${API_URL}/api/posts`, { params: { page, limit: 10 } })
			.then((response) => {
				// Deleted the last post of the last page: step back one page.
				if (!response.data.posts.length && page > response.data.pages) {
					setPage(response.data.pages);
					return;
				}
				setPosts(response.data.posts);
				setPages(response.data.pages);
			})
			.catch((err) => console.error("Error fetching posts:", err));
	}, [page]);

	useEffect(() => {
		loadPosts();
	}, [loadPosts]);

	const replacePost = (updated) =>
		setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));

	const handleLike = (postId) => {
		setError("");
		axios
			.post(`${API_URL}/api/posts/like/${postId}`)
			.then((response) => replacePost(response.data))
			.catch((err) => setError(err.response?.data?.error || "Error liking post"));
	};

	const handleAddComment = (postId) => {
		setError("");
		const text = (commentInputs[postId] || "").trim();
		if (!text) return;
		axios
			.post(`${API_URL}/api/posts/comment/${postId}`, { text })
			.then((response) => {
				replacePost(response.data);
				setCommentInputs({ ...commentInputs, [postId]: "" });
			})
			.catch((err) => setError(err.response?.data?.error || "Error adding comment"));
	};

	const handleDelete = (postId) => {
		if (!window.confirm("Delete this post?")) return;
		axios
			.delete(`${API_URL}/api/posts/${postId}`)
			.then(() => loadPosts())
			.catch((err) => setError(err.response?.data?.error || "Error deleting post"));
	};

	const handleSaveEdit = () => {
		const formData = new FormData();
		formData.append("title", editing.title);
		formData.append("content", editing.content);
		axios
			.put(`${API_URL}/api/posts/${editing.id}`, formData)
			.then((response) => {
				replacePost(response.data);
				setEditing(null);
			})
			.catch((err) => setError(err.response?.data?.error || "Error updating post"));
	};

	return (
		<div className="home">
			<h2>Recent Posts</h2>
			{error && <p className="error">{error}</p>}
			{!user && (
				<p>
					<Link to="/login">Log in</Link> to post, like and comment.
				</p>
			)}
			{posts.map((post) => {
				const isOwner = user && post.author && post.author._id === user.id;
				const liked = user && post.likes.includes(user.id);
				return (
					<div key={post._id} className="post">
						{editing && editing.id === post._id ? (
							<>
								<input
									type="text"
									value={editing.title}
									onChange={(e) => setEditing({ ...editing, title: e.target.value })}
								/>
								<textarea
									value={editing.content}
									onChange={(e) => setEditing({ ...editing, content: e.target.value })}
								></textarea>
								<button onClick={handleSaveEdit}>Save</button>
								<button onClick={() => setEditing(null)}>Cancel</button>
							</>
						) : (
							<>
								<h3>{post.title}</h3>
								<small>by {post.author ? post.author.username : "unknown"}</small>
								<p>{post.content}</p>
							</>
						)}
						{post.file && (
							<div>
								<Attachment file={post.file} />
							</div>
						)}
						{isOwner && !(editing && editing.id === post._id) && (
							<div>
								<button onClick={() => setEditing({ id: post._id, title: post.title, content: post.content })}>
									Edit
								</button>
								<button onClick={() => handleDelete(post._id)}>Delete</button>
							</div>
						)}
						<p>Likes: {post.likes.length}</p>
						{user && (
							<button onClick={() => handleLike(post._id)}>{liked ? "Unlike" : "Like"}</button>
						)}
						<p>Comments: {post.comments.length}</p>
						<ul>
							{post.comments.map((comment, index) => (
								<li key={comment._id || index}>
									<strong>{comment.author ? comment.author.username : "unknown"}:</strong> {comment.text}
								</li>
							))}
						</ul>

						{user && (
							<>
								<input
									type="text"
									placeholder="Add a comment"
									className="comment-input"
									value={commentInputs[post._id] || ""}
									onChange={(e) => setCommentInputs({ ...commentInputs, [post._id]: e.target.value })}
								/>
								<button onClick={() => handleAddComment(post._id)} className="comment-button">
									Add Comment
								</button>
							</>
						)}
					</div>
				);
			})}
			<div className="pagination">
				<button disabled={page <= 1} onClick={() => setPage(page - 1)}>
					Previous
				</button>
				<span>
					{" "}Page {page} of {pages}{" "}
				</span>
				<button disabled={page >= pages} onClick={() => setPage(page + 1)}>
					Next
				</button>
			</div>
		</div>
	);
}

export default Home;
