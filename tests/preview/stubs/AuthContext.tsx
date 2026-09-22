export const useAuth = () => ({ user: { id: 'stu-1', email: 'a@test' }, session: null, loading: false });
export const AuthProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
