import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)
export const ToastContext = createContext(null)
export const ConfirmContext = createContext(null)
export const NotificationsContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useTheme = () => useContext(ThemeContext)
export const useToast = () => useContext(ToastContext)
export const useConfirm = () => useContext(ConfirmContext)
export const useNotifications = () => useContext(NotificationsContext)
