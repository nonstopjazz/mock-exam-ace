import { Home, Map, Trophy, ShoppingBag, User, Menu } from "lucide-react";
import { NavLink } from "@/components/galaxy/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "首頁", url: "/", icon: Home },
  { title: "任務地圖", url: "/quests", icon: Map },
  { title: "成就", url: "/achievements", icon: Trophy },
  { title: "寶石商店", url: "/shop", icon: ShoppingBag },
  { title: "個人檔案", url: "/profile", icon: User },
];

export function AppSidebar() {
  const { open } = useSidebar();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className="border-r border-border bg-card">
      <SidebarContent>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Menu className="h-5 w-5 text-primary-foreground" />
            </div>
            {open && (
              <div>
                <h2 className="font-bold text-foreground">WordQuest</h2>
                <p className="text-xs text-muted-foreground">編年史</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>導航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {open && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
