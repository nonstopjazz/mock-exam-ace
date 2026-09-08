import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";

/**
 * 後台頁首。
 *
 * 存在的理由不是省幾行 markup，而是【讓「出得去」這件事由元件保證，
 * 而不是由記性保證】。/admin/classes 與 /admin/writing 原本各自手寫頁首，
 * 兩頁都漏了回管理中心的連結 —— 後台沒有 Navbar，從書籤直接進來的人
 * 連上一頁都沒得按，只能自己改網址。
 *
 * 新增後台頁面時用這個元件，麵包屑就自動有了。
 */

export interface AdminCrumb {
  label: string;
  to: string;
}

/**
 * 麵包屑只列【祖先】，不重複目前這一頁 —— 目前的頁名就在下面的 h1。
 * 手機上讓它換行，不做橫向捲動。
 */
export const AdminBreadcrumb = ({ trail = [] }: { trail?: AdminCrumb[] }) => (
  <nav aria-label="麵包屑" className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
    <Link
      to="/admin"
      className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      管理中心
    </Link>
    {trail.map((crumb) => (
      <span key={crumb.to} className="flex items-center gap-x-1 min-w-0">
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
        <Link
          to={crumb.to}
          className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors truncate rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {crumb.label}
        </Link>
      </span>
    ))}
  </nav>
);

export const AdminPageHeader = ({
  icon: Icon,
  title,
  subtitle,
  action,
  trail,
}: {
  /** 沒有圖示時（例如標題是學生的作文題目）可以不給 */
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  trail?: AdminCrumb[];
}) => (
  <div className="mb-8">
    <AdminBreadcrumb trail={trail} />
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        {Icon ? (
          <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
            <Icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">{title}</h1>
          {subtitle ? (
            <p className="text-sm md:text-base text-muted-foreground truncate">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  </div>
);
