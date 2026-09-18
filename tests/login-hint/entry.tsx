import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@/index.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "@/pages/Login";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter>
);
