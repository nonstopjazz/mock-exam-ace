import { PRODUCT_CONFIG } from "@/config/product";

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            © 2025 {PRODUCT_CONFIG.tagline}. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">
              使用條款
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              隱私政策
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              聯絡我們
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
