import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { DEMO } from './config'
import AuthProvider from './context/AuthProvider'
import ConfirmProvider from './context/ConfirmProvider'
import NotificationsProvider from './context/NotificationsProvider'
import ThemeProvider from './context/ThemeProvider'
import ToastProvider from './context/ToastProvider'
import Layout from './components/Layout'
import { FeedSkeleton } from './components/States'
import Auth from './pages/Auth'
import Explore from './pages/Explore'
import Home from './pages/Home'
import { NotFound, NotificationsPage, PostPage, RequireAuth, SavedPage, SearchPage, TagPage } from './pages/Simple'

const Profile = lazy(() => import('./pages/Profile'))
const Messages = lazy(() => import('./pages/Messages'))
const Settings = lazy(() => import('./pages/Settings'))
const Admin = lazy(() => import('./pages/Admin'))
const Router = DEMO ? HashRouter : BrowserRouter

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <ConfirmProvider>
            <AuthProvider>
              <NotificationsProvider>
                <Suspense fallback={<div className="container"><FeedSkeleton count={1} /></div>}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<Home />} />
                      <Route path="explore" element={<Explore />} />
                      <Route path="login" element={<Auth mode="login" />} />
                      <Route path="register" element={<Auth mode="register" />} />
                      <Route path="u/:username" element={<Profile />} />
                      <Route path="post/:id" element={<PostPage />} />
                      <Route path="tag/:tag" element={<TagPage />} />
                      <Route path="search" element={<SearchPage />} />
                      <Route path="saved" element={<RequireAuth><SavedPage /></RequireAuth>} />
                      <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
                      <Route path="messages" element={<RequireAuth><Messages /></RequireAuth>} />
                      <Route path="messages/:username" element={<RequireAuth><Messages /></RequireAuth>} />
                      <Route path="settings" element={<RequireAuth><Settings /></RequireAuth>} />
                      <Route path="admin" element={<RequireAuth><Admin /></RequireAuth>} />
                      <Route path="admin/:tab" element={<RequireAuth><Admin /></RequireAuth>} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </NotificationsProvider>
            </AuthProvider>
          </ConfirmProvider>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  )
}
