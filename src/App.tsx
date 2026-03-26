import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/galaxy/AppSidebar";
import { Navbar } from "./components/layout/Navbar";
import { LockedPage } from "./components/gates/LockedPage";
import { PhaseGate } from "./components/gates/PhaseGate";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RequireAdmin } from "./components/auth/RequireAdmin";
import { AuthProvider } from "./contexts/AuthContext";
import { PhaseProvider } from "./contexts/PhaseContext";
import { IS_PRODUCTION } from "./config/features";
import { useDocumentHead } from "./hooks/useDocumentHead";

// Admin pages
import PacksAdmin from "./pages/admin/PacksAdmin";
import PackItemsAdmin from "./pages/admin/PackItemsAdmin";
import TokensAdmin from "./pages/admin/TokensAdmin";
import BlogAdmin from "./pages/admin/BlogAdmin";
import ExamAdmin from "./pages/admin/ExamAdmin";
import ExamQuestionsEditor from "./pages/admin/ExamQuestionsEditor";
import SiteSettings from "./pages/admin/SiteSettings";
import UsersAdmin from "./pages/admin/UsersAdmin";
import AdminHome from "./pages/admin/AdminHome";
import Home from "./pages/Home";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import ClaimPack from "./pages/ClaimPack";
import ExamList from "./pages/ExamList";
import ExamNew from "./pages/ExamNew";
import ExamResult from "./pages/ExamResult";
import ExamExplanation from "./pages/ExamExplanation";
import Dashboard from "./pages/Dashboard";
import Essay from "./pages/Essay";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import ExamResultSummary from "./pages/ExamResultSummary";

// Galaxy Quest (遊戲化練習)
import Phase0Index from "./pages/practice/Phase0Index";
import PracticeIndex from "./pages/practice/Index";
import PracticeQuests from "./pages/practice/Quests";
import PracticeQuest from "./pages/practice/Quest";
import PracticeAchievements from "./pages/practice/Achievements";
import PracticeShop from "./pages/practice/Shop";
import PracticeProfile from "./pages/practice/Profile";
import VocabularyHub from "./pages/practice/VocabularyHub";
import SRSReview from "./pages/practice/SRSReview";
import Flashcards from "./pages/practice/Flashcards";
import QuickQuiz from "./pages/practice/QuickQuiz";
import VocabularyCollections from "./pages/practice/VocabularyCollections";
import VideoCourses from "./pages/practice/VideoCourses";
import CourseDetail from "./pages/practice/CourseDetail";
import DripCourse from "./pages/practice/DripCourse";
import VocabularyPackDetail from "./pages/practice/VocabularyPackDetail";
import WeakWords from "./pages/practice/WeakWords";
import CourseManagement from "./pages/practice/CourseManagement";
import CourseEdit from "./pages/practice/CourseEdit";
import AdminDashboard from "./pages/practice/AdminDashboard";
import AchievementManagement from "./pages/practice/AchievementManagement";
import ExamManagement from "./pages/practice/ExamManagement";
import QuestMapManagement from "./pages/practice/QuestMapManagement";
import ShopManagement from "./pages/practice/ShopManagement";
import TagManagement from "./pages/practice/TagManagement";
import VocabularyManagement from "./pages/practice/VocabularyManagement";
import VocabularyPackList from "./pages/practice/VocabularyPackList";

const queryClient = new QueryClient();

// 用於設定動態 document head 的組件
function DocumentHead({ children }: { children: React.ReactNode }) {
  useDocumentHead();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DocumentHead>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <PhaseProvider>
          <Routes>
            {/* Main app routes */}
            <Route path="/" element={<Home />} />

            {/* Blog routes */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />

            {/* Auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Claim pack route */}
            <Route path="/claim/:token" element={<ClaimPack />} />

          {/* Phase 2: Exam routes (gated by backend phase) */}
          <Route path="/exams" element={<PhaseGate requiredPhase={2} title="學測模考" description="模考功能即將推出，敬請期待！"><ExamList /></PhaseGate>} />
          <Route path="/exam" element={<PhaseGate requiredPhase={2} title="學測模考" description="模考功能即將推出，敬請期待！"><ExamNew /></PhaseGate>} />
          <Route path="/exam/result/:attemptId" element={<PhaseGate requiredPhase={2} title="模考結果" description="模考功能即將推出，敬請期待！"><ExamResult /></PhaseGate>} />
          <Route path="/exam/explanation/:attemptId" element={<PhaseGate requiredPhase={2} title="題目解析" description="模考功能即將推出，敬請期待！"><ExamExplanation /></PhaseGate>} />
          <Route path="/dashboard" element={<PhaseGate requiredPhase={2} title="學習儀表板" description="儀表板功能即將推出，敬請期待！"><Dashboard /></PhaseGate>} />
          <Route path="/dashboard/result-summary" element={<ExamResultSummary />} />
          <Route path="/essay" element={<PhaseGate requiredPhase={2} title="AI 作文批改" description="作文批改功能即將推出，敬請期待！"><Essay /></PhaseGate>} />

          {/* Admin routes - protected by RequireAdmin (production-ready) */}
          <Route path="/admin/packs" element={
            <RequireAdmin>
              <PacksAdmin />
            </RequireAdmin>
          } />
          <Route path="/admin/packs/:packId/items" element={
            <RequireAdmin>
              <PackItemsAdmin />
            </RequireAdmin>
          } />
          <Route path="/admin/tokens" element={
            <RequireAdmin>
              <TokensAdmin />
            </RequireAdmin>
          } />
          <Route path="/admin/blog" element={
            <RequireAdmin>
              <BlogAdmin />
            </RequireAdmin>
          } />
          <Route path="/admin/exams" element={
            <RequireAdmin>
              <ExamAdmin />
            </RequireAdmin>
          } />
          <Route path="/admin/exams/:examId/questions" element={
            <RequireAdmin>
              <ExamQuestionsEditor />
            </RequireAdmin>
          } />
          <Route path="/admin/settings" element={
            <RequireAdmin>
              <SiteSettings />
            </RequireAdmin>
          } />
          <Route path="/admin/users" element={
            <RequireAdmin>
              <UsersAdmin />
            </RequireAdmin>
          } />

          {/* Admin Home - main dashboard */}
          <Route path="/admin" element={
            <RequireAdmin>
              <AdminHome />
            </RequireAdmin>
          } />

          {/* Legacy admin routes - only in dev mode */}
          {!IS_PRODUCTION && (
            <>
              <Route path="/admin/upload" element={<><Navbar /><Admin /></>} />
              <Route path="/admin/course-management" element={<><Navbar /><CourseManagement /></>} />
              <Route path="/admin/exam-management" element={<><Navbar /><ExamManagement /></>} />
              <Route path="/admin/vocabulary-management" element={<><Navbar /><VocabularyManagement /></>} />
              <Route path="/admin/vocabulary-packs" element={<><Navbar /><VocabularyPackList /></>} />
              <Route path="/admin/quest-map-management" element={<><Navbar /><QuestMapManagement /></>} />
              <Route path="/admin/shop-management" element={<><Navbar /><ShopManagement /></>} />
              <Route path="/admin/achievement-management" element={<><Navbar /><AchievementManagement /></>} />
              <Route path="/admin/tag-management" element={<><Navbar /><TagManagement /></>} />
            </>
          )}

          {/* Video Courses (Phase 2) */}
          <Route path="/courses" element={<PhaseGate requiredPhase={2} title="影片課程" description="課程功能即將推出，敬請期待！"><Navbar /><VideoCourses /></PhaseGate>} />
          <Route path="/course/:courseId" element={<PhaseGate requiredPhase={2} title="影片課程" description="課程功能即將推出，敬請期待！"><Navbar /><CourseDetail /></PhaseGate>} />
          <Route path="/drip-course/:courseId" element={<PhaseGate requiredPhase={2} title="影片課程" description="課程功能即將推出，敬請期待！"><Navbar /><DripCourse /></PhaseGate>} />
          <Route path="/course-management" element={<Navigate to="/" replace />} />
          <Route path="/course-management/:courseId/edit" element={<Navigate to="/" replace />} />

          {/* Phase 0: Practice pages (require login for progress sync) */}
          <Route path="/practice" element={<ProtectedRoute><Navbar /><Phase0Index /></ProtectedRoute>} />
          <Route path="/practice/vocabulary" element={<ProtectedRoute><Navbar /><VocabularyHub /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/srs" element={<ProtectedRoute><Navbar /><SRSReview /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/flashcards" element={<ProtectedRoute><Navbar /><Flashcards /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/quiz" element={<ProtectedRoute><Navbar /><QuickQuiz /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/collections" element={<ProtectedRoute><Navbar /><VocabularyCollections /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/pack/:packId" element={<ProtectedRoute><Navbar /><VocabularyPackDetail /></ProtectedRoute>} />
          <Route path="/practice/vocabulary/weak-words" element={<ProtectedRoute><Navbar /><WeakWords /></ProtectedRoute>} />

          {/* Phase 1: Game features (gated by backend phase) */}
          <Route path="/practice/quest/:lessonId" element={<PhaseGate requiredPhase={1} title="任務關卡" description="任務地圖功能即將推出，敬請期待！"><ProtectedRoute><Navbar /><PracticeQuest /></ProtectedRoute></PhaseGate>} />
          <Route path="/practice/quests" element={<PhaseGate requiredPhase={1} title="任務地圖" description="任務地圖功能即將推出，敬請期待！"><ProtectedRoute><Navbar /><PracticeQuests /></ProtectedRoute></PhaseGate>} />
          <Route path="/practice/achievements" element={<PhaseGate requiredPhase={1} title="成就系統" description="成就系統功能即將推出，敬請期待！"><ProtectedRoute><Navbar /><PracticeAchievements /></ProtectedRoute></PhaseGate>} />
          <Route path="/practice/shop" element={<PhaseGate requiredPhase={1} title="寶石商店" description="寶石商店功能即將推出，敬請期待！"><ProtectedRoute><Navbar /><PracticeShop /></ProtectedRoute></PhaseGate>} />
          <Route path="/practice/profile" element={<PhaseGate requiredPhase={1} title="個人檔案" description="個人檔案功能即將推出，敬請期待！"><ProtectedRoute><Navbar /><PracticeProfile /></ProtectedRoute></PhaseGate>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </PhaseProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </DocumentHead>
  </QueryClientProvider>
);

export default App;
