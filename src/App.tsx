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
