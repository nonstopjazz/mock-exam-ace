import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { BookOpen, Shield, Gamepad2, Menu, FileText } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserStatus } from "@/components/auth/UserStatus";
import { useAdmin } from "@/hooks/useAdmin";

// Phase 0: Only show vocabulary practice
// Phase 2 items (exams, dashboard, essay, courses) are hidden until launch
const navigationItems = [
  { to: "/practice", label: "單字練習", icon: Gamepad2 },
  { to: "/blog", label: "學習專欄", icon: FileText },
  { to: "/admin", label: "後台管理", icon: Shield, adminOnly: true },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAdmin();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 text-lg md:text-xl font-bold text-primary">
          <BookOpen className="h-5 w-5 md:h-6 md:w-6" />
          <span className="hidden sm:inline">Joe救學測英文</span>
          <span className="sm:hidden">Joe救英文</span>
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

        {/* Desktop User Status */}
        <div className="hidden md:flex items-center gap-2">
          <UserStatus />
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
                Joe救學測英文
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
              {/* Mobile User Status */}
              <div className="mt-4 border-t pt-4">
                <UserStatus compact />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
