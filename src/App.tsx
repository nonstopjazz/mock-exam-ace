import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/galaxy/AppSidebar";
import { Navbar } from "./components/layout/Navbar";
import Home from "./pages/Home";
import ExamList from "./pages/ExamList";
import ExamNew from "./pages/ExamNew";
import ExamResult from "./pages/ExamResult";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Main app routes */}
          <Route path="/" element={<Home />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exam" element={<ExamNew />} />
          <Route path="/exam/result/:attemptId" element={<ExamResult />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/essay" element={<Essay />} />
          <Route path="/admin" element={<Admin />} />

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
                        <Route path="/vocabulary/collections" element={<VocabularyCollections />} />
                        <Route path="/vocabulary/pack/:packId" element={<VocabularyPackDetail />} />
                        <Route path="/courses" element={<VideoCourses />} />
                        <Route path="/course/:courseId" element={<CourseDetail />} />
                        <Route path="/drip-course/:courseId" element={<DripCourse />} />
                        <Route path="/course-management" element={<CourseManagement />} />
                        <Route path="/course-management/:courseId/edit" element={<CourseEdit />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/admin/course-management" element={<CourseManagement />} />
                        <Route path="/admin/exam-management" element={<ExamManagement />} />
                        <Route path="/admin/vocabulary-management" element={<VocabularyManagement />} />
                        <Route path="/admin/quest-map-management" element={<QuestMapManagement />} />
                        <Route path="/admin/shop-management" element={<ShopManagement />} />
                        <Route path="/admin/achievement-management" element={<AchievementManagement />} />
                        <Route path="/admin/tag-management" element={<TagManagement />} />
                      </Routes>
                    </main>
                  </div>
                </div>
              </SidebarProvider>
            </>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
