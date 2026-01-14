import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/galaxy/AppSidebar";
import { Navbar } from "./components/layout/Navbar";
import { LockedPage } from "./components/gates/LockedPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RequireAdmin } from "./components/auth/RequireAdmin";
import { AuthProvider } from "./contexts/AuthContext";
import { IS_PRODUCTION } from "./config/features";

// Admin pages
import PacksAdmin from "./pages/admin/PacksAdmin";
import PackItemsAdmin from "./pages/admin/PackItemsAdmin";
import TokensAdmin from "./pages/admin/TokensAdmin";
import BlogAdmin from "./pages/admin/BlogAdmin";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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

          {/* Phase 2: Locked - Exam routes */}
          <Route path="/exams" element={<LockedPage title="學測模考" description="模考功能即將推出，敬請期待！" />} />
          <Route path="/exam" element={<LockedPage title="學測模考" description="模考功能即將推出，敬請期待！" />} />
          <Route path="/exam/result/:attemptId" element={<LockedPage title="模考結果" description="模考功能即將推出，敬請期待！" />} />
          <Route path="/exam/explanation/:attemptId" element={<LockedPage title="題目解析" description="模考功能即將推出，敬請期待！" />} />
          <Route path="/dashboard" element={<LockedPage title="學習儀表板" description="儀表板功能即將推出，敬請期待！" />} />
          <Route path="/essay" element={<LockedPage title="AI 作文批改" description="作文批改功能即將推出，敬請期待！" />} />

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

          {/* Legacy admin routes - blocked in production, accessible in dev */}
          {IS_PRODUCTION ? (
            <Route path="/admin" element={<Navigate to="/admin/packs" replace />} />
          ) : (
            <>
              <Route path="/admin" element={<><Navbar /><AdminDashboard /></>} />
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

          {/* Video Courses - hidden/locked for now */}
          <Route path="/courses" element={<LockedPage title="影片課程" description="課程功能即將推出，敬請期待！" />} />
          <Route path="/course/:courseId" element={<LockedPage title="影片課程" description="課程功能即將推出，敬請期待！" />} />
          <Route path="/drip-course/:courseId" element={<LockedPage title="影片課程" description="課程功能即將推出，敬請期待！" />} />
          <Route path="/course-management" element={<Navigate to="/" replace />} />
          <Route path="/course-management/:courseId/edit" element={<Navigate to="/" replace />} />

          {/* Phase 0: Practice pages without sidebar */}
          <Route path="/practice" element={<><Navbar /><Phase0Index /></>} />
          <Route path="/practice/vocabulary" element={<><Navbar /><VocabularyHub /></>} />
          <Route path="/practice/vocabulary/srs" element={<><Navbar /><SRSReview /></>} />
          <Route path="/practice/vocabulary/flashcards" element={<><Navbar /><Flashcards /></>} />
          <Route path="/practice/vocabulary/quiz" element={<><Navbar /><QuickQuiz /></>} />
          <Route path="/practice/vocabulary/collections" element={<><Navbar /><VocabularyCollections /></>} />
          <Route path="/practice/vocabulary/pack/:packId" element={<><Navbar /><VocabularyPackDetail /></>} />
          <Route path="/practice/vocabulary/weak-words" element={<><Navbar /><WeakWords /></>} />

          {/* Phase 2: Locked game features */}
          <Route path="/practice/quest/:lessonId" element={<LockedPage title="任務關卡" description="任務地圖功能即將推出，敬請期待！" />} />
          <Route path="/practice/quests" element={<LockedPage title="任務地圖" description="任務地圖功能即將推出，敬請期待！" />} />
          <Route path="/practice/achievements" element={<LockedPage title="成就系統" description="成就系統功能即將推出，敬請期待！" />} />
          <Route path="/practice/shop" element={<LockedPage title="寶石商店" description="寶石商店功能即將推出，敬請期待！" />} />
          <Route path="/practice/profile" element={<LockedPage title="個人檔案" description="個人檔案功能即將推出，敬請期待！" />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
