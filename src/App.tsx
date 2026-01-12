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
import { AuthProvider } from "./contexts/AuthContext";
import { IS_PRODUCTION } from "./config/features";
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

// Galaxy Quest (遊戲化練習)
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

          {/* Admin routes - blocked in production, accessible in dev */}
          {IS_PRODUCTION ? (
            <Route path="/admin/*" element={<Navigate to="/" replace />} />
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

          {/* Quest page without sidebar (full-screen immersive experience) */}
          <Route path="/practice/quest/:lessonId" element={<PracticeQuest />} />

          {/* Galaxy Quest - All other pages with sidebar */}
          <Route path="/practice/*" element={
            <>
              <Navbar />
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <div className="flex-1 flex flex-col">
                    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 backdrop-blur-sm bg-background/95">
                      <SidebarTrigger className="-ml-1" />
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">WordQuest 編年史</h2>
                      </div>
                    </header>
                    <main className="flex-1">
                      <Routes>
                        <Route path="/" element={<PracticeIndex />} />
                        <Route path="/quests" element={<PracticeQuests />} />
                        <Route path="/achievements" element={<PracticeAchievements />} />
                        <Route path="/shop" element={<PracticeShop />} />
                        <Route path="/profile" element={<PracticeProfile />} />
                        <Route path="/vocabulary" element={<VocabularyHub />} />
                        <Route path="/vocabulary/srs" element={<SRSReview />} />
                        <Route path="/vocabulary/flashcards" element={<Flashcards />} />
                        <Route path="/vocabulary/quiz" element={<QuickQuiz />} />
                        <Route path="/vocabulary/collections" element={
                          <ProtectedRoute>
                            <VocabularyCollections />
                          </ProtectedRoute>
                        } />
                        <Route path="/vocabulary/pack/:packId" element={<VocabularyPackDetail />} />
                      </Routes>
                    </main>
                  </div>
                </div>
              </SidebarProvider>
            </>
          } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
