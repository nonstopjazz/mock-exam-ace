import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { BookOpen, Shield, Menu, Gamepad2, FileText, GraduationCap, LayoutDashboard, PenTool, Video } from "lucide-react";
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
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { PRODUCT_CONFIG } from "@/config/product";

// Icon mapping for dynamic navigation
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  vocabulary: Gamepad2,
  blog: FileText,
  exams: GraduationCap,
  dashboard: LayoutDashboard,
  essay: PenTool,
  courses: Video,
};

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAdmin();
  const { getEnabledTabs } = useSiteSettings();

  // Get dynamic navigation items from settings
  const enabledTabs = getEnabledTabs();

  // Build navigation items: dynamic tabs + admin (if admin)
  const navigationItems = [
    ...enabledTabs.map(tab => ({
      to: tab.path,
      label: tab.label,
      icon: iconMap[tab.key] || FileText,
    })),
    // Admin link always at the end (only visible to admins)
    ...(isAdmin ? [{ to: "/admin", label: "後台管理", icon: Shield }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 text-lg md:text-xl font-bold text-primary">
          <BookOpen className="h-5 w-5 md:h-6 md:w-6" />
          <span className="hidden sm:inline">{PRODUCT_CONFIG.name}</span>
          <span className="sm:hidden">{PRODUCT_CONFIG.shortName}</span>
        </NavLink>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          {navigationItems.map((item) => {
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
                {PRODUCT_CONFIG.name}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-8 flex flex-col gap-4">
              {navigationItems.map((item) => {
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
