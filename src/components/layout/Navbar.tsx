import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { BookOpen, LayoutDashboard, PenTool, Settings } from "lucide-react";

export const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <NavLink to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
          <BookOpen className="h-6 w-6" />
          <span>學測英文模考</span>
        </NavLink>

        <div className="flex items-center gap-6">
          <NavLink
            to="/exams"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            activeClassName="text-primary"
          >
            選擇試題
          </NavLink>
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            activeClassName="text-primary"
          >
            <LayoutDashboard className="h-4 w-4" />
            儀表板
          </NavLink>
          <NavLink
            to="/essay"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            activeClassName="text-primary"
          >
            <PenTool className="h-4 w-4" />
            作文批改
          </NavLink>
          <NavLink
            to="/admin"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            activeClassName="text-primary"
          >
            <Settings className="h-4 w-4" />
            管理
          </NavLink>
        </div>

        {/* TODO: Add user authentication */}
        <Button variant="outline" size="sm">
          登入
        </Button>
      </div>
    </nav>
  );
};
