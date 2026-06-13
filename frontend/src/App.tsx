import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Bot, FileQuestion, Home, LogIn, LogOut, PenSquare, Plus, UserPlus } from 'lucide-react';
import { useAuth } from './state/AuthContext';
import { AskPage } from './pages/AskPage';
import { FaqDetailPage } from './pages/FaqDetailPage';
import { FaqListPage } from './pages/FaqListPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { PostsPage } from './pages/PostsPage';
import { SignupPage } from './pages/SignupPage';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  const { user, token, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/">
          <div className="brand-mark">AI</div>
          <div>
            <strong>정글 AI 멘토</strong>
            <span>학습 커뮤니티</span>
          </div>
        </NavLink>
        <nav className="nav-list" aria-label="주요 메뉴">
          <NavLink to="/">
            <Home size={17} /> 홈
          </NavLink>
          <NavLink to="/ask">
            <Bot size={17} /> AI 질문
          </NavLink>
          <NavLink to="/posts">
            <PenSquare size={17} /> 게시판
          </NavLink>
          <NavLink to="/faq">
            <FileQuestion size={17} /> FAQ
          </NavLink>
        </nav>
        <div className="header-actions">
          {token ? (
            <>
              <div className="user-chip">
                <span>{user?.nickname ?? '로그인 중'}</span>
                <small>{user?.email}</small>
              </div>
              <button className="ghost-button" type="button" onClick={logout}>
                <LogOut size={16} /> 로그아웃
              </button>
            </>
          ) : (
            <div className="auth-links">
              <NavLink to="/login">
                <LogIn size={16} /> 로그인
              </NavLink>
              <NavLink to="/signup">
                <UserPlus size={16} /> 회원가입
              </NavLink>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Jungle AI Mentor</span>
            <h1>질문, 답변, 저장소 분석을 한 흐름에서 관리합니다</h1>
          </div>
          <NavLink className="primary-button" to="/posts/new">
            <Plus size={17} /> 글쓰기
          </NavLink>
        </header>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/ask"
            element={
              <ProtectedRoute>
                <AskPage />
              </ProtectedRoute>
            }
          />
          <Route path="/faq" element={<FaqListPage />} />
          <Route path="/faq/:id" element={<FaqDetailPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route
            path="/posts/new"
            element={
              <ProtectedRoute>
                <PostEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route
            path="/posts/:id/edit"
            element={
              <ProtectedRoute>
                <PostEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Routes>
      </main>
    </div>
  );
}
