import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/exams" element={<ExamList />} />
          <Route path="/exam" element={<ExamNew />} />
          <Route path="/exam/result/:attemptId" element={<ExamResult />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/essay" element={<Essay />} />
          <Route path="/admin" element={<Admin />} />

          {/* Galaxy Quest - 遊戲化每日練習 */}
          <Route path="/practice" element={<PracticeIndex />} />
          <Route path="/practice/quests" element={<PracticeQuests />} />
          <Route path="/practice/quest/:lessonId" element={<PracticeQuest />} />
          <Route path="/practice/achievements" element={<PracticeAchievements />} />
          <Route path="/practice/shop" element={<PracticeShop />} />
          <Route path="/practice/profile" element={<PracticeProfile />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
