import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { BookOpen, LayoutDashboard, PenTool, Shield, Gamepad2, Menu, Video, ClipboardList } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigationItems = [
  { to: "/exams", label: "選擇試題", icon: ClipboardList },
  { to: "/practice", label: "每日練習", icon: Gamepad2 },
  { to: "/dashboard", label: "儀表板", icon: LayoutDashboard },
  { to: "/essay", label: "作文批改", icon: PenTool },
  { to: "/practice/courses", label: "影片課程", icon: Video },
  { to: "/practice/admin", label: "後台管理", icon: Shield, adminOnly: true },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  // TODO: Replace with actual authentication system
  // For now, check localStorage for admin status
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin') === 'true');

  const toggleAdmin = () => {
    const newAdminStatus = !isAdmin;
    setIsAdmin(newAdminStatus);
    localStorage.setItem('isAdmin', String(newAdminStatus));
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 text-lg md:text-xl font-bold text-primary">
          <BookOpen className="h-5 w-5 md:h-6 md:w-6" />
          <span className="hidden sm:inline">學測英文模考</span>
          <span className="sm:hidden">英文模考</span>
        </NavLink>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          {navigationItems.map((item) => {
            // Skip admin-only items if user is not admin
            if (item.adminOnly && !isAdmin) return null;

            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                activeClassName="text-primary"
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </NavLink>
            );
          })}
        </div>

        {/* Desktop Login Button & Admin Toggle */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant={isAdmin ? "default" : "outline"}
            size="sm"
            onClick={toggleAdmin}
            className="text-xs"
          >
            {isAdmin ? "管理員模式" : "切換管理員"}
          </Button>
          <Button variant="outline" size="sm">
            登入
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="sm">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] sm:w-[400px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                學測英文模考
              </SheetTitle>
            </SheetHeader>
            <div className="mt-8 flex flex-col gap-4">
              {navigationItems.map((item) => {
                // Skip admin-only items if user is not admin
                if (item.adminOnly && !isAdmin) return null;

                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    activeClassName="bg-primary/10 text-primary"
                    onClick={() => setOpen(false)}
                  >
                    {Icon && <Icon className="h-5 w-5" />}
                    {item.label}
                  </NavLink>
                );
              })}
              <div className="mt-4 px-4 space-y-2">
                <Button
                  variant={isAdmin ? "default" : "outline"}
                  className="w-full"
                  onClick={toggleAdmin}
                >
                  {isAdmin ? "管理員模式" : "切換管理員"}
                </Button>
                <Button variant="outline" className="w-full">
                  登入
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
