import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@/index.css";
import SRSReview from "@/pages/practice/SRSReview";
import QuickQuiz from "@/pages/practice/QuickQuiz";
import Flashcards from "@/pages/practice/Flashcards";
import SpellingPractice from "@/pages/practice/SpellingPractice";
import FillBlank from "@/pages/practice/FillBlank";
import MatchGame from "@/pages/practice/MatchGame";
import SynonymAntonym from "@/pages/practice/SynonymAntonym";

const PAGES: Record<string, React.ComponentType> = {
  srs: SRSReview, quiz: QuickQuiz, flashcards: Flashcards,
  spelling: SpellingPractice, "fill-blank": FillBlank,
  match: MatchGame, "synonym-antonym": SynonymAntonym,
};

const name = new URLSearchParams(location.search).get("page") || "quiz";
const Page = PAGES[name];

createRoot(document.getElementById("root")!).render(
  <MemoryRouter><Page /></MemoryRouter>
);
